import {
  AnyRef, AnyResourceRef,
  BasicResourceData,
  field, isNotNullResourceId, isNullResourceId, isResource, isResourceRef, Pl, PlClient,
  PlTransaction,
  ResourceId
} from '@milaboratory/pl-client-v2';
import { createRenderHeavyBlock, createBContextFromUpstreams } from './block-pack/template_render';
import {
  Block,
  BlockRenderingStateKey,
  ProjectStructure,
  ProjectStructureKey,
  parseProjectField,
  ProjectField,
  projectFieldName,
  ProjectRenderingState,
  SchemaVersionCurrent,
  SchemaVersionKey,
  ProjectResourceType,
  InitialBlockStructure,
  InitialProjectRenderingState,
  ProjectMetaKey,
  InitialBlockMeta,
  parseBlockFrontendStateKey,
  blockFrontendStateKey,
  blockArgsAuthorKey,
  ProjectLastModifiedTimestamp, ProjectCreatedTimestamp
} from '../model/project_model';
import { BlockPackTemplateField, createBlockPack } from './block-pack/block_pack';
import { allBlocks, BlockGraph, graphDiff, productionGraph, stagingGraph } from '../model/project_model_util';
import { BlockPackSpecPrepared } from '../model';
import { notEmpty } from '@milaboratory/ts-helpers';
import { AuthorMarker, ProjectMeta } from '@milaboratory/pl-middle-layer-model';
import Denque from 'denque';

type FieldStatus = 'NotReady' | 'Ready' | 'Error';

interface BlockFieldState {
  modCount: number,
  ref?: AnyRef;
  status?: FieldStatus;
  value?: Uint8Array;
}

type BlockFieldStates = Partial<Record<ProjectField['fieldName'], BlockFieldState>>

interface BlockInfoState {
  readonly id: string;
  readonly fields: BlockFieldStates;
}

function cached<ModId, T>(modIdCb: () => ModId, valueCb: () => T): () => T {
  let initialized = false;
  let lastModId: ModId | undefined = undefined;
  let value: T | undefined = undefined;
  return () => {
    if (!initialized) {
      initialized = true;
      lastModId = modIdCb();
      value = valueCb();
      return value as T;
    }
    const currentModId = modIdCb();
    if (lastModId !== currentModId) {
      lastModId = currentModId;
      value = valueCb();
    }
    return valueCb() as T;
  };
}

class BlockInfo {
  constructor(
    public readonly id: string,
    public readonly fields: BlockFieldStates) {
  }

  private readonly currentInputsC = cached(
    () => this.fields.currentArgs!.modCount,
    () => JSON.parse(Buffer.from(this.fields.currentArgs!.value!).toString())
  );
  private readonly actualProductionInputsC = cached(
    () => this.fields.prodArgs?.modCount,
    () => {
      const bin = this.fields.prodArgs?.value;
      if (bin === undefined)
        return undefined;
      return JSON.parse(Buffer.from(bin).toString());
    }
  );

  get currentInputs(): any {
    return this.currentInputsC();
  }

  get stagingRendered(): boolean {
    return this.fields.stagingCtx !== undefined;
  }

  get productionRendered(): boolean {
    return this.fields.prodCtx !== undefined;
  }

  private readonly productionStaleC: () => boolean = cached(
    () => `${this.fields.currentArgs!.modCount}_${this.fields.prodArgs?.modCount}`,
    () => this.fields.prodArgs === undefined || Buffer.compare(this.fields.currentArgs!.value!, this.fields.prodArgs.value!) !== 0
  );

  get productionStale(): boolean {
    return this.productionRendered && this.productionStaleC();
  }

  get requireProductionRendering(): boolean {
    return !this.productionRendered || this.productionStaleC();
  }

  get actualProductionInputs(): any | undefined {
    return this.actualProductionInputsC();
  }

  public getTemplate(tx: PlTransaction): AnyRef {
    return tx.getFutureFieldValue(
      Pl.unwrapHolder(tx, this.fields.blockPack!.ref!),
      BlockPackTemplateField, 'Input'
    );
  }
}

export interface NewBlockSpec {
  blockPack: BlockPackSpecPrepared,
  args: string
}

const NoNewBlocks = (blockId: string) => {
  throw new Error(`No new block info for ${blockId}`);
};

export interface SetArgsRequest {
  blockId: string;
  args: string;
}

type GraphInfoFields =
  | 'stagingUpstream' | 'stagingDownstream'
  | 'futureProductionUpstream' | 'futureProductionDownstream'
  | 'actualProductionUpstream' | 'actualProductionDownstream'

export class ProjectMutator {
  private globalModCount = 0;
  private fieldsChanged: boolean = false;

  //
  // Change trackers
  //

  private lastModifiedChanged = false;
  private structureChanged = false;
  private metaChanged = false;
  private renderingStateChanged = false;
  private readonly changedBlockFrontendStates = new Set<string>();
  private readonly removedBlockFrontendStates = new Set<string>();

  /** Set blocks will be assigned current mutator author marker on save */
  private readonly blocksWithChangedInputs = new Set<string>();

  constructor(public readonly rid: ResourceId,
              private readonly tx: PlTransaction,
              private readonly author: AuthorMarker | undefined,
              private readonly schema: string,
              private lastModified: number,
              private meta: ProjectMeta,
              private struct: ProjectStructure,
              private readonly renderingState: Omit<ProjectRenderingState, 'blocksInLimbo'>,
              private readonly blocksInLimbo: Set<string>,
              private readonly blockInfos: Map<string, BlockInfo>,
              private readonly blockFrontendStates: Map<string, string>
  ) {
  }

  get wasModified(): boolean {
    return this.lastModifiedChanged
      || this.fieldsChanged
      || this.metaChanged
      || this.renderingStateChanged
      || this.changedBlockFrontendStates.size > 0
      || this.removedBlockFrontendStates.size > 0;
  }

  get structure(): ProjectStructure {
    // clone
    return JSON.parse(JSON.stringify(this.struct));
  }

  //
  // Graph calculation
  //

  private stagingGraph: BlockGraph | undefined = undefined;
  private pendingProductionGraph: BlockGraph | undefined = undefined;
  private actualProductionGraph: BlockGraph | undefined = undefined;

  private getStagingGraph(): BlockGraph {
    if (this.stagingGraph === undefined)
      this.stagingGraph = stagingGraph(this.struct);
    return this.stagingGraph;
  }

  private getPendingProductionGraph(): BlockGraph {
    if (this.pendingProductionGraph === undefined)
      this.pendingProductionGraph = productionGraph(this.struct,
        blockId => this.getBlockInfo(blockId).currentInputs);
    return this.pendingProductionGraph;
  }

  private getActualProductionGraph(): BlockGraph {
    if (this.actualProductionGraph === undefined)
      this.actualProductionGraph = productionGraph(this.struct,
        blockId => this.getBlockInfo(blockId).actualProductionInputs);
    return this.actualProductionGraph;
  }

  //
  // Generic helpers to interact with project state
  //

  private getBlockInfo(blockId: string): BlockInfo {
    return notEmpty(this.blockInfos.get(blockId));
  }

  private getBlock(blockId: string): Block {
    for (const block of allBlocks(this.struct))
      if (block.id === blockId)
        return block;
    throw new Error('block not found');
  }

  private setBlockFieldObj(blockId: string, fieldName: keyof BlockFieldStates,
                           state: Omit<BlockFieldState, 'modCount'>) {
    const fid = field(this.rid, projectFieldName(blockId, fieldName));

    if (state.ref === undefined)
      throw new Error('Can\'t set value with empty ref');

    if (this.getBlockInfo(blockId).fields[fieldName] === undefined)
      this.tx.createField(fid, 'Dynamic', state.ref);
    else
      this.tx.setField(fid, state.ref);

    this.getBlockInfo(blockId).fields[fieldName] = {
      modCount: this.globalModCount++,
      ...state
    };

    this.fieldsChanged = true;
  }

  private setBlockField(
    blockId: string, fieldName: keyof BlockFieldStates,
    ref: AnyRef, status: FieldStatus, value?: Uint8Array
  ) {
    this.setBlockFieldObj(blockId, fieldName, { ref, status, value });
  }

  private deleteBlockFields(blockId: string, ...fieldNames: (keyof BlockFieldStates)[]): boolean {
    let deleted = false;
    const info = this.getBlockInfo(blockId);
    for (const fieldName of fieldNames) {
      const fields = info.fields;
      if (!(fieldName in fields))
        continue;
      this.tx.removeField(field(this.rid, projectFieldName(blockId, fieldName)));
      delete fields[fieldName];
      this.fieldsChanged = true;
      deleted = true;
    }
    return deleted;
  }

  private updateLastModified() {
    this.lastModified = Date.now();
    this.lastModifiedChanged = true;
  }

  //
  // Main project actions
  //

  private resetStagingRefreshTimestamp() {
    this.renderingState.stagingRefreshTimestamp = Date.now();
    this.renderingStateChanged = true;
  }

  private resetStaging(blockId: string): void {
    const fields = this.getBlockInfo(blockId).fields;
    if (fields.stagingOutput?.status === 'Ready' && fields.stagingCtx?.status === 'Ready') {
      this.setBlockFieldObj(blockId, 'stagingOutputPrevious', fields.stagingOutput);
      this.setBlockFieldObj(blockId, 'stagingCtxPrevious', fields.stagingCtx);
    }
    if (this.deleteBlockFields(blockId, 'stagingOutput', 'stagingCtx'))
      this.resetStagingRefreshTimestamp();
  }

  private resetProduction(blockId: string): void {
    const fields = this.getBlockInfo(blockId).fields;
    if (fields.prodOutput?.status === 'Ready' && fields.prodCtx?.status === 'Ready') {
      this.setBlockFieldObj(blockId, 'prodOutputPrevious', fields.prodOutput);
      this.setBlockFieldObj(blockId, 'prodCtxPrevious', fields.prodCtx);
    }
    this.deleteBlockFields(blockId, 'prodOutput', 'prodCtx');
  }

  /** Running blocks are reset, already computed moved to limbo. Returns if
   * either of the actions were actually performed. */
  private resetOrLimboProduction(blockId: string): boolean {
    const fields = this.getBlockInfo(blockId).fields;
    if (fields.prodOutput?.status === 'Ready' && fields.prodCtx?.status === 'Ready') {
      if (this.blocksInLimbo.has(blockId))
        // we are already in limbo
        return false;

      // limbo
      this.blocksInLimbo.add(blockId);
      this.renderingStateChanged = true;

      // doing some gc
      this.deleteBlockFields(blockId, 'prodOutputPrevious', 'prodCtxPrevious');

      return true;
    } else
      // reset
      return this.deleteBlockFields(blockId, 'prodOutput', 'prodCtx');
  }

  /** Optimally sets inputs for multiple blocks in one go */
  public setArgs(requests: SetArgsRequest[]) {
    const changed: string[] = [];
    for (const { blockId, args } of requests) {
      const info = this.getBlockInfo(blockId);
      JSON.parse(args); // checking
      const binary = Buffer.from(args);
      if (Buffer.compare(info.fields.currentArgs!.value!, binary) === 0)
        continue;
      const argsRef = this.tx.createValue(Pl.JsonObject, binary);
      this.setBlockField(blockId, 'currentArgs', argsRef, 'Ready', binary);
      // will be assigned our author marker
      this.blocksWithChangedInputs.add(blockId);
      changed.push(blockId);
    }

    // resetting staging outputs for all downstream blocks
    this.getStagingGraph().traverse('downstream', changed,
      ({ id }) => this.resetStaging(id));

    if (changed.length > 0)
      this.updateLastModified();
  }

  public setUiState(blockId: string, newState: string | undefined): void {
    if (this.blockInfos.get(blockId) === undefined)
      throw new Error('no such block');
    if (this.blockFrontendStates.get(blockId) === newState)
      return;
    if (newState === undefined)
      this.blockFrontendStates.delete(blockId);
    else
      this.blockFrontendStates.set(blockId, newState);
    this.changedBlockFrontendStates.add(blockId);
    // will be assigned our author marker
    this.blocksWithChangedInputs.add(blockId);
    this.updateLastModified();
  }

  private createCtx(upstream: Set<string>, ctxField: 'stagingCtx' | 'prodCtx'): AnyRef {
    const upstreamContexts: AnyRef[] = [];
    upstream.forEach(id => {
      const info = this.getBlockInfo(id);
      if (info.fields[ctxField] === undefined || info.fields[ctxField]!.ref === undefined)
        throw new Error('One of the upstreams staging is not rendered.');
      upstreamContexts.push(Pl.unwrapHolder(this.tx, info.fields[ctxField]!.ref!));
    });
    return createBContextFromUpstreams(this.tx, upstreamContexts);
  }

  private renderStagingFor(blockId: string) {
    this.resetStaging(blockId);

    const info = this.getBlockInfo(blockId);

    const ctx = this.createCtx(
      this.getStagingGraph().nodes.get(blockId)!.upstream,
      'stagingCtx');

    if (this.getBlock(blockId).renderingMode !== 'Heavy')
      throw new Error('not supported yet');

    const tpl = info.getTemplate(this.tx);

    const results = createRenderHeavyBlock(this.tx, tpl, {
      args: info.fields.currentArgs!.ref!,
      blockId: this.tx.createValue(Pl.JsonString, JSON.stringify(blockId)),
      isProduction: this.tx.createValue(Pl.JsonBool, JSON.stringify(false)),
      context: ctx
    });
    this.setBlockField(blockId, 'stagingCtx', Pl.wrapInEphHolder(this.tx, results.context), 'NotReady');
    this.setBlockField(blockId, 'stagingOutput', results.result, 'NotReady');
  }

  private renderProductionFor(blockId: string) {
    this.resetProduction(blockId);

    const info = this.getBlockInfo(blockId);

    const ctx = this.createCtx(
      this.getPendingProductionGraph().nodes.get(blockId)!.upstream,
      'prodCtx');

    if (this.getBlock(blockId).renderingMode === 'Light')
      throw new Error('Can\'t render production for light block.');

    const tpl = info.getTemplate(this.tx);

    const results = createRenderHeavyBlock(this.tx, tpl, {
      args: info.fields.currentArgs!.ref!,
      blockId: this.tx.createValue(Pl.JsonString, JSON.stringify(blockId)),
      isProduction: this.tx.createValue(Pl.JsonBool, JSON.stringify(true)),
      context: ctx
    });
    this.setBlockField(blockId, 'prodCtx', Pl.wrapInEphHolder(this.tx, results.context), 'NotReady');
    this.setBlockField(blockId, 'prodOutput', results.result, 'NotReady');

    // saving inputs for which we rendered the production
    this.setBlockFieldObj(blockId, 'prodArgs', info.fields.currentArgs!);

    // removing block from limbo as we juts rendered fresh production for it
    if (this.blocksInLimbo.delete(blockId))
      this.renderingStateChanged = true;
  }

  //
  // Structure changes
  //

  /** Very generic method, better check for more specialized case-specific methods first. */
  public updateStructure(newStructure: ProjectStructure, newBlockSpecProvider: (blockId: string) => NewBlockSpec = NoNewBlocks): void {
    const currentStagingGraph = this.getStagingGraph();
    const currentActualProductionGraph = this.getActualProductionGraph();

    const newStagingGraph = stagingGraph(newStructure);

    // new actual production graph without new blocks
    const newActualProductionGraph = productionGraph(newStructure,
      blockId => this.blockInfos.get(blockId)?.actualProductionInputs);

    const stagingDiff = graphDiff(currentStagingGraph, newStagingGraph);
    const prodDiff = graphDiff(currentActualProductionGraph, newActualProductionGraph);

    // removing blocks
    for (const blockId of stagingDiff.onlyInA) {
      const { fields } = this.getBlockInfo(blockId);
      this.deleteBlockFields(blockId, ...(Object.keys(fields) as ProjectField['fieldName'][]));
      this.blockInfos.delete(blockId);
      if (this.blocksInLimbo.delete(blockId))
        this.renderingStateChanged = true;
      if (this.blockFrontendStates.delete(blockId))
        this.removedBlockFrontendStates.add(blockId);
    }

    // creating new blocks
    for (const blockId of stagingDiff.onlyInB) {
      this.blockInfos.set(blockId, new BlockInfo(blockId, {}));
      const spec = newBlockSpecProvider(blockId);

      // block pack
      const bp = createBlockPack(this.tx, spec.blockPack);
      this.setBlockField(blockId, 'blockPack',
        Pl.wrapInHolder(this.tx, bp), 'NotReady');

      // args
      const binArgs = Buffer.from(spec.args);
      const argsRes = this.tx.createValue(Pl.JsonObject, binArgs);
      this.setBlockField(blockId, 'currentArgs', argsRes, 'Ready', binArgs);
    }

    // resetting stagings affected by topology change
    for (const blockId of stagingDiff.different)
      this.resetStaging(blockId);

    // applying changes due to topology change in production to affected nodes and
    // all their downstreams
    currentActualProductionGraph.traverse('downstream', [...prodDiff.different], node => {
      this.resetOrLimboProduction(node.id);
    });

    if (stagingDiff.onlyInB.size > 0 || stagingDiff.onlyInA.size > 0 || stagingDiff.different.size > 0)
      this.resetStagingRefreshTimestamp();

    this.struct = newStructure;
    this.structureChanged = true;
    this.stagingGraph = undefined;
    this.pendingProductionGraph = undefined;
    this.actualProductionGraph = undefined;

    this.updateLastModified();
  }

  //
  // Structure change helpers
  //

  public addBlock(block: Block, spec: NewBlockSpec, before?: string): void {
    const newStruct = this.structure; // copy current structure
    if (before === undefined) {
      // adding as a very last block
      newStruct.groups[newStruct.groups.length - 1].blocks.push(block);
    } else {
      let done = false;
      for (const group of newStruct.groups) {
        const idx = group.blocks.findIndex(b => b.id === before);
        if (idx < 0)
          continue;
        group.blocks.splice(idx, 0, block);
        done = true;
        break;
      }
      if (!done)
        throw new Error(`Can't find element with id: ${before}`);
    }
    this.updateStructure(newStruct, (blockId) => {
      if (blockId !== block.id)
        throw new Error('Unexpected');
      return spec;
    });
  }

  public deleteBlock(blockId: string): void {
    const newStruct = this.structure; // copy current structure
    let done = false;
    for (const group of newStruct.groups) {
      const idx = group.blocks.findIndex(b => b.id === blockId);
      if (idx < 0)
        continue;
      group.blocks.splice(idx, 1);
      done = true;
      break;
    }
    if (!done)
      throw new Error(`Can't find element with id: ${blockId}`);
    this.updateStructure(newStruct);
  }

  //
  // Block-pack migration
  //

  public migrateBlockPack(blockId: string, spec: BlockPackSpecPrepared,
                          newArgs?: string): void {
    const info = this.getBlockInfo(blockId);

    this.setBlockField(blockId, 'blockPack',
      Pl.wrapInHolder(this.tx, createBlockPack(this.tx, spec)),
      'NotReady');

    if (newArgs !== undefined) {
      // this will also reset all downstream stagings
      this.setArgs([{ blockId, args: newArgs }]);
      // reset UI state along with args
      this.setUiState(blockId, undefined);
    } else
      // resetting staging outputs for all downstream blocks
      this.getStagingGraph().traverse('downstream', [blockId],
        ({ id }) => this.resetStaging(id));

    // also reset or limbo all downstream productions
    if (info.productionRendered)
      this.getActualProductionGraph().traverse('downstream', [blockId],
        ({ id }) => this.resetOrLimboProduction(id));

    this.updateLastModified();
  }

  //
  // Render
  //

  public renderProduction(blockIds: string[], addUpstreams: boolean = false): Set<string> {
    const blockIdsSet = new Set(blockIds);

    const prodGraph = this.getPendingProductionGraph();
    if (addUpstreams)
      // adding all upstreams automatically
      prodGraph.traverse('upstream', blockIds, node => {
        blockIdsSet.add(node.id);
      });
    else
      // checking that targets contain all upstreams
      for (const blockId of blockIdsSet) {
        const node = prodGraph.nodes.get(blockId);
        if (node === undefined)
          throw new Error(`Can't find block with id: ${blockId}`);
        for (const upstream of node.upstream)
          if (!blockIdsSet.has(upstream))
            throw new Error('Can\'t render blocks not including all upstreams.');
      }

    // traversing in topological order and rendering target blocks
    const rendered = new Set<string>();
    for (const block of allBlocks(this.structure)) {
      if (!blockIdsSet.has(block.id))
        continue;

      let render =
        this.getBlockInfo(block.id).requireProductionRendering
        || this.blocksInLimbo.has(block.id);

      if (!render)
        for (const upstream of prodGraph.nodes.get(block.id)!.upstream)
          if (rendered.has(upstream)) {
            render = true;
            break;
          }

      if (render) {
        this.renderProductionFor(block.id);
        rendered.add(block.id);
      }
    }

    // sending to limbo all downstream blocks
    prodGraph.traverse('downstream', [...rendered], node => {
      if (rendered.has(node.id)) // don't send to limbo blocks that were just rendered
        return;
      this.resetOrLimboProduction(node.id);
    });

    if (rendered.size > 0)
      this.updateLastModified();

    return rendered;
  }

  /** Stops running blocks from the list and modify states of other blocks
   * accordingly */
  public stopProduction(...blockIds: string[]) {
    const activeProdGraph = this.getActualProductionGraph();

    // we will stop all blocks listed in request and all their downstreams
    const queue = new Denque(blockIds);
    const queued = new Set(blockIds);
    const stopped: string[] = [];

    while (!queue.isEmpty()) {
      const blockId = queue.shift()!;
      const fields = this.getBlockInfo(blockId).fields;

      if (fields.prodOutput?.status === 'Ready' && fields.prodCtx?.status === 'Ready')
        // skipping finished blocks
        continue;

      if (this.deleteBlockFields(blockId, 'prodOutput', 'prodCtx')) {
        // was actually stopped
        stopped.push(blockId);

        // will try to stop all its downstreams
        for (const downstream of activeProdGraph.traverseIdsExcludingRoots('downstream', blockId)) {
          if (queued.has(downstream))
            continue;
          queue.push(downstream);
          queued.add(downstream);
        }
      }
    }

    // blocks under stopped blocks, but still having results, goes to limbo
    for (const blockId of activeProdGraph.traverseIdsExcludingRoots('downstream', ...stopped))
      this.resetOrLimboProduction(blockId);
  }

  private traverseWithStagingLag(cb: (blockId: string, lag: number) => void) {
    const lags = new Map<string, number>();
    const stagingGraph = this.getStagingGraph();
    stagingGraph.nodes.forEach(node => {
      const info = this.getBlockInfo(node.id);
      let lag = info.stagingRendered ? 0 : 1;
      node.upstream.forEach(upstream => {
        const upstreamLag = lags.get(upstream)!;
        if (upstreamLag === 0)
          return;
        lag = Math.max(upstreamLag + 1, lag);
      });
      cb(node.id, lag);
      lags.set(node.id, lag);
    });
  }

  /** @param stagingRenderingRate rate in blocks per second */
  private refreshStagings(stagingRenderingRate?: number) {
    const elapsed = Date.now() - this.renderingState.stagingRefreshTimestamp;
    const lagThreshold = stagingRenderingRate === undefined
      ? undefined
      : 1 + Math.max(0, elapsed * stagingRenderingRate / 1000);
    let rendered = 0;
    this.traverseWithStagingLag((blockId, lag) => {
      if (lag === 0) // meaning staging already rendered
        return;
      if (lagThreshold === undefined || lag <= lagThreshold) {
        this.renderStagingFor(blockId);
        rendered++;
      }
    });
    if (rendered > 0)
      this.resetStagingRefreshTimestamp();
  }

  //
  // Meta
  //

  /** Updates project metadata */
  public setMeta(meta: ProjectMeta): void {
    this.meta = meta;
    this.metaChanged = true;
    this.updateLastModified();
  }

  //
  // Maintenance
  //

  /** @param stagingRenderingRate rate in blocks per second */
  public doRefresh(stagingRenderingRate?: number) {
    this.refreshStagings(stagingRenderingRate);
    this.blockInfos.forEach(blockInfo => {
      if (blockInfo.fields.prodCtx?.status === 'Ready' && blockInfo.fields.prodOutput?.status === 'Ready')
        this.deleteBlockFields(blockInfo.id, 'prodOutputPrevious', 'prodCtxPrevious');
      if (blockInfo.fields.stagingCtx?.status === 'Ready' && blockInfo.fields.stagingOutput?.status === 'Ready')
        this.deleteBlockFields(blockInfo.id, 'stagingOutputPrevious', 'stagingCtxPrevious');
    });
  }

  private assignAuthorMarkers() {
    const markerStr = JSON.stringify(this.author);
    for (const blockId of this.blocksWithChangedInputs)
      if (this.author === undefined)
        this.tx.deleteKValue(this.rid, blockArgsAuthorKey(blockId));
      else
        this.tx.setKValue(this.rid, blockArgsAuthorKey(blockId), markerStr);
  }

  public save() {
    if (!this.wasModified)
      return;

    if (this.lastModifiedChanged)
      this.tx.setKValue(this.rid, ProjectLastModifiedTimestamp, JSON.stringify(this.lastModified));

    if (this.structureChanged)
      this.tx.setKValue(this.rid, ProjectStructureKey, JSON.stringify(this.struct));

    if (this.renderingStateChanged)
      this.tx.setKValue(this.rid, BlockRenderingStateKey, JSON.stringify(
        {
          ...this.renderingState,
          blocksInLimbo: [...this.blocksInLimbo]
        } as ProjectRenderingState
      ));

    if (this.metaChanged)
      this.tx.setKValue(this.rid, ProjectMetaKey, JSON.stringify(this.meta));

    for (const blockId of this.changedBlockFrontendStates) {
      const uiState = this.blockFrontendStates.get(blockId);
      if (uiState === undefined)
        this.tx.deleteKValue(this.rid, blockFrontendStateKey(blockId));
      else
        this.tx.setKValue(this.rid, blockFrontendStateKey(blockId), uiState);
    }
    for (const blockId of this.removedBlockFrontendStates)
      this.tx.deleteKValue(this.rid, blockFrontendStateKey(blockId));

    this.assignAuthorMarkers();
  }
}

export interface ProjectState {
  schema: string;
  structure: ProjectStructure;
  renderingState: Omit<ProjectRenderingState, 'blocksInLimbo'>;
  blocksInLimbo: Set<string>;
  blockInfos: Map<string, BlockInfo>;
}

export async function loadProject(tx: PlTransaction, rid: ResourceId, author?: AuthorMarker): Promise<ProjectMutator> {
  const fullResourceStateP = tx.getResourceData(rid, true);
  const schemaP = tx.getKValueJson<string>(rid, SchemaVersionKey);
  const lastModifiedP = tx.getKValueJson<number>(rid, ProjectLastModifiedTimestamp);
  const metaP = tx.getKValueJson<ProjectMeta>(rid, ProjectMetaKey);
  const structureP = tx.getKValueJson<ProjectStructure>(rid, ProjectStructureKey);
  const renderingStateP = tx.getKValueJson<ProjectRenderingState>(rid, BlockRenderingStateKey);

  const allKVP = tx.listKeyValuesString(rid);

  // loading jsons
  const [fullResourceState,
    schema, lastModified, meta, structure,
    { stagingRefreshTimestamp, blocksInLimbo },
    allKV
  ] =
    await Promise.all([fullResourceStateP,
      schemaP, lastModifiedP, metaP, structureP,
      renderingStateP,
      allKVP]);
  if (schema !== SchemaVersionCurrent)
    throw new Error(`Can't act on this project resource because it has a wrong schema version: ${schema}`);


  // loading field information
  const blockInfoStates = new Map<string, BlockInfoState>();
  for (const f of fullResourceState.fields) {
    const projectField = parseProjectField(f.name);

    // processing only fields with known structure
    if (projectField === undefined)
      continue;

    let info = blockInfoStates.get(projectField.blockId);
    if (info === undefined) {
      info = {
        id: projectField.blockId,
        fields: {}
      };
      blockInfoStates.set(projectField.blockId, info);
    }

    info.fields[projectField.fieldName] = isNullResourceId(f.value)
      ? { modCount: 0 }
      : { modCount: 0, ref: f.value };
  }

  const renderingState = { stagingRefreshTimestamp };
  const blocksInLimboSet = new Set(blocksInLimbo);

  const blockFrontendStates = new Map<string, string>();
  for (const kv of allKV) {
    const blockId = parseBlockFrontendStateKey(kv.key);
    if (blockId === undefined)
      continue;
    blockFrontendStates.set(blockId, kv.value);
  }

  const requests: [BlockFieldState, Promise<BasicResourceData>][] = [];
  blockInfoStates!.forEach(({ id, fields }) => {
    for (const [, state] of Object.entries(fields)) {
      if (state.ref === undefined)
        continue;
      if (!isResource(state.ref) || isResourceRef(state.ref))
        throw new Error('unexpected behaviour');
      requests.push([state, tx.getResourceData(state.ref, false)]);
    }
  });
  for (const [state, response] of requests) {
    const result = await response;
    state.value = result.data;
    if (isNotNullResourceId(result.error))
      state.status = 'Error';
    else if (result.resourceReady || isNotNullResourceId(result.originalResourceId))
      state.status = 'Ready';
    else
      state.status = 'NotReady';
  }

  const blockInfos = new Map<string, BlockInfo>();
  blockInfoStates.forEach(({ id, fields }) => blockInfos.set(id, new BlockInfo(id, fields)));

  // check consistency of project state
  const blockInStruct = new Set<string>();
  for (const b of allBlocks(structure)) {
    if (!blockInfos.has(b.id))
      throw new Error(`Inconsistent project structure: no inputs for ${b.id}`);
    blockInStruct.add(b.id);
  }
  blockInfos.forEach(info => {
    if (!blockInStruct.has(info.id))
      throw new Error(`Inconsistent project structure: no structure entry for ${info.id}`);
  });

  return new ProjectMutator(rid, tx, author,
    schema, lastModified, meta, structure, renderingState, blocksInLimboSet,
    blockInfos, blockFrontendStates);
}

export function createProject(tx: PlTransaction, meta: ProjectMeta = InitialBlockMeta): AnyResourceRef {
  const prj = tx.createEphemeral(ProjectResourceType);
  tx.lock(prj);
  const ts = String(Date.now());
  tx.setKValue(prj, SchemaVersionKey, JSON.stringify(SchemaVersionCurrent));
  tx.setKValue(prj, ProjectCreatedTimestamp, ts);
  tx.setKValue(prj, ProjectLastModifiedTimestamp, ts);
  tx.setKValue(prj, ProjectMetaKey, JSON.stringify(meta));
  tx.setKValue(prj, ProjectStructureKey, JSON.stringify(InitialBlockStructure));
  tx.setKValue(prj, BlockRenderingStateKey, JSON.stringify(InitialProjectRenderingState));
  return prj;
}

export async function withProject<T>(txOrPl: PlTransaction | PlClient, rid: ResourceId, cb: (p: ProjectMutator) => T | Promise<T>): Promise<T> {
  return withProjectAuthored(txOrPl, rid, undefined, cb);
}

export async function withProjectAuthored<T>(txOrPl: PlTransaction | PlClient, rid: ResourceId, author: AuthorMarker | undefined,
                                             cb: (p: ProjectMutator) => T | Promise<T>): Promise<T> {
  if (txOrPl instanceof PlClient) {
    return await txOrPl.withWriteTx('ProjectAction', async tx => {
      const mut = await loadProject(tx, rid, author);
      const result = await cb(mut);
      if (!mut.wasModified)
        // skipping save and commit altogether if no modifications were
        // actually made
        return result;
      mut.save();
      await tx.commit();
      return result;
    });
  } else {
    const mut = await loadProject(txOrPl, rid, author);
    const result = await cb(mut);
    mut.save();
    return result;
  }
}
