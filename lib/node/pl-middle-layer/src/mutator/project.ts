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
  BlockStructureKey, parseProjectField,
  ProjectField, projectFieldName,
  ProjectRenderingState, SchemaVersionCurrent,
  SchemaVersionKey, ProjectResourceType, InitialBlockStructure, InitialProjectRenderingState
} from '../model/project_model';
import { BlockPackTemplateField, createBlockPack } from './block-pack/block_pack';
import { allBlocks, BlockGraph, graphDiff, productionGraph, stagingGraph } from '../model/project_model_util';
import { BlockPackSpec } from '../model/block_pack_spec';
import { notEmpty } from '@milaboratory/ts-helpers';

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
  private renderingStateChanged = false;

  constructor(public readonly rid: ResourceId,
              private readonly tx: PlTransaction,
              private readonly schema: string,
              private struct: ProjectStructure,
              private readonly renderingState: Omit<ProjectRenderingState, 'blocksInLimbo'>,
              private readonly blocksInLimbo: Set<string>,
              private readonly blockInfos: Map<string, BlockInfo>
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
    const fid = field(this.rid, projectFieldName({ blockId, fieldName: fieldName }));

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
    this.tx.removeField(field(this.rid, projectFieldName({ blockId, fieldName })));
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
  }

  public updateStructure(newStructure: ProjectStructure, newBlockSpecProvider: (blockId: string) => NewBlockSpec = NoNewBlocks) {
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
        this.tx.removeField(field(this.rid, projectFieldName({ blockId, fieldName } as ProjectField)));
      this.blockInfos.delete(blockId);
      this.blocksInLimbo.delete(blockId);
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

  public renderProduction(blockIds: string[]) {
    const blockIdsSet = new Set(blockIds);

    // checking that targets contain all upstreams
    const prodGraph = this.getPendingProductionGraph();
    for (const blockId of blockIdsSet) {
      const node = prodGraph.nodes.get(blockId)!;
      for (const upstream of node.upstream)
        if (!blockIdsSet.has(upstream))
          throw new Error('Can\'t render blocks not including all upstreams.');
    }

    // traversing in topological order and rendering target blocks
    for (const block of allBlocks(this.structure))
      if (blockIdsSet.has(block.id))
        this.renderProductionFor(block.id);
  }

  public save() {
    if (this.structureChanged)
      this.tx.setKValue(this.rid, BlockStructureKey, JSON.stringify(this.struct));

    if (this.renderingStateChanged)
      this.tx.setKValue(this.rid, BlockRenderingStateKey, JSON.stringify(
        {
          ...this.renderingState,
          blocksInLimbo: [...this.blocksInLimbo]
        } as ProjectRenderingState
      ));
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

  /** @param rate rate in blocks per second */
  private refreshStagings(rate: number) {
    const elapsed = Date.now() - this.renderingState.stagingRefreshTimestamp;
    const lagThreshold = 1 + Math.max(0, elapsed * rate / 1000);
    this.traverseWithStagingLag((blockId, lag) => {
      if (lag <= lagThreshold)
        this.renderStagingFor(blockId);
    });
    this.resetStagingRefreshTimestamp();
  }

  // public refreshRequired(): boolean {
  //
  // }

  /** @param stagingRenderingRate rate in blocks per second */
  public doRefresh(stagingRenderingRate: number = 10) {
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
  const structureP = tx.getKValueJson<ProjectStructure>(rid, BlockStructureKey);
  const renderingStateP = tx.getKValueJson<ProjectRenderingState>(rid, BlockRenderingStateKey);

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
  const structure = await structureP;

  const { stagingRefreshTimestamp, blocksInLimbo } = await renderingStateP;
  const renderingState = { stagingRefreshTimestamp };
  const blocksInLimboSet = new Set(blocksInLimbo);

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
    schema, structure, renderingState, blocksInLimboSet,
    blockInfos);
}

export function createProject(tx: PlTransaction): AnyResourceRef {
  const prj = tx.createEphemeral(ProjectResourceType);
  tx.lock(prj);
  tx.setKValue(prj, SchemaVersionKey, JSON.stringify(SchemaVersionCurrent));
  tx.setKValue(prj, BlockStructureKey, JSON.stringify(InitialBlockStructure));
  tx.setKValue(prj, BlockRenderingStateKey, JSON.stringify(InitialProjectRenderingState));
  return prj;
}
