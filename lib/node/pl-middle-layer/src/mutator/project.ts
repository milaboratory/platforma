import {
  AnyRef, AnyResourceRef,
  BasicResourceData,
  field, isNotNullResourceId, isNullResourceId, isResource, isResourceRef, Pl,
  PlTransaction,
  ResourceId
} from '@milaboratory/pl-client-v2';
import { createRenderHeavyBlock, createBContextFromUpstreams } from './template_render';
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
  ProjectMeta,
  ProjectMetaKey, InitialBlockMeta, parseBlockFrontendStateKey, blockFrontendStateKey
} from '../model/project_model';
import { BlockPackTemplateField, createBlockPack } from './block-pack/block_pack';
import { allBlocks, BlockGraph, graphDiff, productionGraph, stagingGraph } from '../model/project_model_util';
import { BlockPackSpec } from '../model/block_pack_spec';
import { notEmpty } from '@milaboratory/ts-helpers';
import { toJS } from 'yaml/dist/nodes/toJS';

type FieldStatus = 'NotReady' | 'Ready' | 'Error';

interface BlockFieldState {
  modCount: number,
  ref?: AnyRef;
  status?: FieldStatus;
  value?: Uint8Array;
}

export type BlockFieldStates = Partial<Record<ProjectField['fieldName'], BlockFieldState>>

export interface BlockInfoState {
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

export class BlockInfo {
  constructor(
    public readonly id: string,
    public readonly fields: BlockFieldStates) {
  }

  private readonly currentInputsC = cached(
    () => this.fields.currentInputs!.modCount,
    () => JSON.parse(Buffer.from(this.fields.currentInputs!.value!).toString())
  );
  private readonly actualProductionInputsC = cached(
    () => this.fields.prodInputs?.modCount,
    () => {
      const bin = this.fields.prodInputs?.value;
      if (bin === undefined)
        return undefined;
      return JSON.parse(Buffer.from(bin).toString());
    }
  );

  get currentInputs(): any {
    return this.currentInputsC();
  }

  get stagingRendered(): any {
    return this.fields.stagingCtx !== undefined;
  }

  get productionRendered(): any {
    return this.fields.prodCtx !== undefined;
  }

  private readonly productionStaleC = cached(
    () => `${this.fields.currentInputs!.modCount}_${this.fields.prodInputs?.modCount}`,
    () => this.fields.prodInputs === undefined || Buffer.compare(this.fields.currentInputs!.value!, this.fields.prodInputs.value!) !== 0
  );

  get productionStale(): any {
    return this.productionRendered && this.productionStaleC();
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
  blockPack: BlockPackSpec,
  inputs: string
}

const NoNewBlocks = (blockId: string) => {
  throw new Error(`No new block info for ${blockId}`);
};

export interface SetInputRequest {
  blockId: string;
  inputs: string;
}

type GraphInfoFields =
  | 'stagingUpstream' | 'stagingDownstream'
  | 'futureProductionUpstream' | 'futureProductionDownstream'
  | 'actualProductionUpstream' | 'actualProductionDownstream'

export class ProjectMutator {
  private globalModCount = 0;
  private structureChanged = false;
  private metaChanged = false;
  private renderingStateChanged = false;
  private readonly changedBlockFrontendStates = new Set<string>();

  constructor(public readonly rid: ResourceId,
              private readonly tx: PlTransaction,
              private readonly schema: string,
              private meta: ProjectMeta,
              private struct: ProjectStructure,
              private readonly renderingState: Omit<ProjectRenderingState, 'blocksInLimbo'>,
              private readonly blocksInLimbo: Set<string>,
              private readonly blockInfos: Map<string, BlockInfo>,
              private readonly blockFrontendStates: Map<string, string>
  ) {
  }

  get structure(): ProjectStructure {
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

  public setBlockFieldObj(blockId: string, fieldName: keyof BlockFieldStates,
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
  }

  private setBlockField(
    blockId: string, fieldName: keyof BlockFieldStates,
    ref: AnyRef, status: FieldStatus, value?: Uint8Array
  ) {
    this.setBlockFieldObj(blockId, fieldName, { ref, status, value });
  }

  private deleteBlockField(blockId: string, fieldName: keyof BlockFieldStates): boolean {
    const fields = this.getBlockInfo(blockId).fields;
    if (!(fieldName in fields))
      return false;
    this.tx.removeField(field(this.rid, projectFieldName(blockId, fieldName)));
    delete fields[fieldName];
    return true;
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
      this.deleteBlockField(blockId, 'stagingOutput');
      this.deleteBlockField(blockId, 'stagingCtx');
    }
    this.resetStagingRefreshTimestamp();
  }

  private resetProduction(blockId: string): void {
    const fields = this.getBlockInfo(blockId).fields;
    if (fields.prodOutput?.status === 'Ready' && fields.prodCtx?.status === 'Ready') {
      this.setBlockFieldObj(blockId, 'prodOutputPrevious', fields.prodOutput);
      this.setBlockFieldObj(blockId, 'prodCtxPrevious', fields.prodCtx);
      this.deleteBlockField(blockId, 'prodOutput');
      this.deleteBlockField(blockId, 'prodCtx');
    }
  }

  private resetOrLimboProduction(blockId: string): void {
    const fields = this.getBlockInfo(blockId).fields;
    if (fields.prodOutput?.status === 'Ready' && fields.prodCtx?.status === 'Ready') {
      // limbo
      this.blocksInLimbo.add(blockId);
      this.renderingStateChanged = true;
      // doing some gc before refresh
      this.deleteBlockField(blockId, 'prodOutputPrevious');
      this.deleteBlockField(blockId, 'prodCtxPrevious');
    } else {
      // reset
      this.deleteBlockField(blockId, 'prodOutput');
      this.deleteBlockField(blockId, 'prodCtx');
    }
  }

  /** Optimally sets inputs for multiple blocks in one go */
  public setInputs(requests: SetInputRequest[]) {
    for (const { blockId, inputs } of requests) {
      const info = this.getBlockInfo(blockId);
      const parsedInputs = JSON.parse(inputs);
      const binary = Buffer.from(inputs);
      const ref = this.tx.createValue(Pl.JsonObject, binary);
      this.setBlockField(blockId, 'currentInputs', ref, 'Ready', binary);
    }

    // resetting staging outputs for all downstream blocks
    this.getStagingGraph().traverse('downstream', requests.map(e => e.blockId),
      ({ id }) => this.resetStaging(id));
  }

  public setFrontendState(blockId: string, newState: string): void {
    if (this.blockInfos.get(blockId) === undefined)
      throw new Error('no such block');
    this.blockFrontendStates.set(blockId, newState);
    this.changedBlockFrontendStates.add(blockId);
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
      args: info.fields.currentInputs!.ref!,
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
      args: info.fields.currentInputs!.ref!,
      blockId: this.tx.createValue(Pl.JsonString, JSON.stringify(blockId)),
      isProduction: this.tx.createValue(Pl.JsonBool, JSON.stringify(true)),
      context: ctx
    });
    this.setBlockField(blockId, 'prodCtx', Pl.wrapInEphHolder(this.tx, results.context), 'NotReady');
    this.setBlockField(blockId, 'prodOutput', results.result, 'NotReady');

    // saving inputs for which we rendered the production
    this.setBlockField(blockId, 'prodInputs', info.fields.currentInputs!.ref!, 'NotReady');

    // removing block from limbo as we juts rendered fresh production for it
    if (this.blocksInLimbo.delete(blockId))
      this.renderingStateChanged = true;
  }

  //
  // Structure changes
  //

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
      for (const fieldName of Object.keys(fields))
        this.tx.removeField(field(this.rid, projectFieldName(blockId, fieldName as ProjectField['fieldName'])));
      this.blockInfos.delete(blockId);
      if (this.blocksInLimbo.delete(blockId))
        this.renderingStateChanged = true;
      if (this.blockFrontendStates.has(blockId))
        this.tx.deleteKValue(this.rid, blockFrontendStateKey(blockId));
    }

    // creating new blocks
    for (const blockId of stagingDiff.onlyInB) {
      this.blockInfos.set(blockId, new BlockInfo(blockId, {}));
      const spec = newBlockSpecProvider(blockId);

      // block pack
      const bp = createBlockPack(this.tx, spec.blockPack);
      this.setBlockField(blockId, 'blockPack',
        Pl.wrapInHolder(this.tx, bp), 'NotReady');

      // inputs
      const binArgs = Buffer.from(spec.inputs);
      const argsRes = this.tx.createValue(Pl.JsonObject, binArgs);
      this.setBlockField(blockId, 'currentInputs', argsRes, 'Ready', binArgs);
    }

    // resetting stagings affected by topology change
    for (const blockId of stagingDiff.different)
      this.resetStaging(blockId);

    // applying changes due to topology change in production
    for (const blockId of prodDiff.different)
      this.resetOrLimboProduction(blockId);

    if (stagingDiff.onlyInB.size > 0 || stagingDiff.onlyInA.size > 0 || stagingDiff.different.size > 0)
      this.resetStagingRefreshTimestamp();

    this.struct = newStructure;
    this.structureChanged = true;
    this.stagingGraph = undefined;
    this.pendingProductionGraph = undefined;
    this.actualProductionGraph = undefined;
  }

  //
  // Structure change helpers
  //

  public addBlock(block: Block, spec: NewBlockSpec, after?: string): void {
    const newStruct = this.structure; // copy current structure
    if (after === undefined) {
      // adding as a very last block
      newStruct.groups[newStruct.groups.length - 1].blocks.push(block);
    } else {
      let done = false;
      for (const group of newStruct.groups) {
        const idx = group.blocks.findIndex(b => b.id === after);
        if (idx < 0)
          continue;
        group.blocks.splice(idx, 0, block);
        done = true;
        break;
      }
      if (!done)
        throw new Error(`Can't find element with id: ${after}`);
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

  public migrateBlockPack(blockId: string, spec: BlockPackSpec, newArgs?: string): void {
    const info = this.getBlockInfo(blockId);

    this.setBlockField(blockId, 'blockPack',
      Pl.wrapInHolder(this.tx, createBlockPack(this.tx, spec)),
      'NotReady');

    if (newArgs !== undefined)
      // this will also reset all downstream stagings
      this.setInputs([{ blockId, inputs: newArgs }]);
    else
      // resetting staging outputs for all downstream blocks
      this.getStagingGraph().traverse('downstream', [blockId],
        ({ id }) => this.resetStaging(id));

    // also reset or limbo all downstream productions
    if (info.productionRendered)
      this.getActualProductionGraph().traverse('downstream', [blockId],
        ({ id }) => this.resetOrLimboProduction(id));
  }

  //
  // Render
  //

  public renderProduction(blockIds: string[]) {
    const blockIdsSet = new Set(blockIds);

    // checking that targets contain all upstreams
    const prodGraph = this.getPendingProductionGraph();
    for (const blockId of blockIdsSet) {
      const node = prodGraph.nodes.get(blockId);
      if (node === undefined)
        throw new Error(`Can't find block with id: ${blockId}`);
      for (const upstream of node.upstream)
        if (!blockIdsSet.has(upstream))
          throw new Error('Can\'t render blocks not including all upstreams.');
    }

    // traversing in topological order and rendering target blocks
    for (const block of allBlocks(this.structure))
      if (blockIdsSet.has(block.id))
        this.renderProductionFor(block.id);
  }

  private traverseWithStagingLag(cb: (blockId: string, lag: number) => void) {
    const lags = new Map<string, number>();
    const stagingGraph = this.getStagingGraph();
    stagingGraph.nodes.forEach(node => {
      const info = this.getBlockInfo(node.id);
      let lag = info.stagingRendered ? 0 : 1;
      node.upstream.forEach(upstream => {
        lag = Math.max(lags.get(upstream)!, lag);
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
    this.traverseWithStagingLag((blockId, lag) => {
      if (lagThreshold === undefined || lag <= lagThreshold)
        this.renderStagingFor(blockId);
    });
    this.resetStagingRefreshTimestamp();
  }

  //
  // Maintenance
  //

  /** @param stagingRenderingRate rate in blocks per second */
  public doRefresh(stagingRenderingRate?: number) {
    this.refreshStagings(stagingRenderingRate);
    this.blockInfos.forEach(blockInfo => {
      if (blockInfo.fields.prodCtx?.status === 'Ready' && blockInfo.fields.prodOutput?.status === 'Ready') {
        this.deleteBlockField(blockInfo.id, 'prodOutputPrevious');
        this.deleteBlockField(blockInfo.id, 'prodCtxPrevious');
      }
      if (blockInfo.fields.stagingCtx?.status === 'Ready' && blockInfo.fields.stagingOutput?.status === 'Ready') {
        this.deleteBlockField(blockInfo.id, 'stagingOutputPrevious');
        this.deleteBlockField(blockInfo.id, 'stagingCtxPrevious');
      }
    });
  }

  public save() {
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

    for (const blockId of this.changedBlockFrontendStates)
      this.tx.setKValue(this.rid, blockFrontendStateKey(blockId), this.blockFrontendStates.get(blockId)!);
  }
}

export interface ProjectState {
  schema: string;
  structure: ProjectStructure;
  renderingState: Omit<ProjectRenderingState, 'blocksInLimbo'>;
  blocksInLimbo: Set<string>;
  blockInfos: Map<string, BlockInfo>;
}

export async function loadProject(tx: PlTransaction, rid: ResourceId): Promise<ProjectMutator> {
  const fullResourceStateP = tx.getResourceData(rid, true);
  const schemaP = tx.getKValueJson<string>(rid, SchemaVersionKey);
  const metaP = tx.getKValueJson<ProjectMeta>(rid, ProjectMetaKey);
  const structureP = tx.getKValueJson<ProjectStructure>(rid, ProjectStructureKey);
  const renderingStateP = tx.getKValueJson<ProjectRenderingState>(rid, BlockRenderingStateKey);

  const allKVP = tx.listKeyValuesString(rid);

  // loading field information
  const blockInfoStates = new Map<string, BlockInfoState>();
  const fullResourceState = await fullResourceStateP;
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

  // loading jsons
  const schema = await schemaP;
  if (schema !== SchemaVersionCurrent)
    throw new Error(`Can't act on this project resource because it has a wrong schema version: ${schema}`);

  const meta = await metaP;

  const structure = await structureP;

  const { stagingRefreshTimestamp, blocksInLimbo } = await renderingStateP;
  const renderingState = { stagingRefreshTimestamp };
  const blocksInLimboSet = new Set(blocksInLimbo);

  const blockFrontendStates = new Map<string, string>();
  for (const kv of await allKVP) {
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

  return new ProjectMutator(rid, tx,
    schema, meta, structure, renderingState, blocksInLimboSet,
    blockInfos, blockFrontendStates);
}

export function createProject(tx: PlTransaction, meta: ProjectMeta = InitialBlockMeta): AnyResourceRef {
  const prj = tx.createEphemeral(ProjectResourceType);
  tx.lock(prj);
  tx.setKValue(prj, SchemaVersionKey, JSON.stringify(SchemaVersionCurrent));
  tx.setKValue(prj, ProjectMetaKey, JSON.stringify(meta));
  tx.setKValue(prj, ProjectStructureKey, JSON.stringify(InitialBlockStructure));
  tx.setKValue(prj, BlockRenderingStateKey, JSON.stringify(InitialProjectRenderingState));
  return prj;
}
