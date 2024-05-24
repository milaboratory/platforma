import {
  AnyRef, AnyResourceRef,
  BasicResourceData, ensureResourceIdNotNull,
  field, isNotNullResourceId, isResource, isResourceRef, KnownResourceTypes,
  PlTransaction,
  ResourceId
} from '@milaboratory/pl-client-v2';
import { notEmpty } from './util';
import { createBContextFromUpstreams, createRenderHeavyBlock } from './template_render';
import {
  Block, BlockPackHolderMainField,
  BlockRenderingStateKey,
  ProjectStructure,
  BlockStructureKey, parseProjectField,
  ProjectField, projectFieldName,
  ProjectRenderingState, SchemaVersionCurrent,
  SchemaVersionKey, BlockPackHolderType, ProjectResourceType, InitialBlockStructure, InitialProjectRenderingState
} from './model/project_model';
import { BlockPackTemplateField, createBlockPack } from './block_pack';
import { allBlocks, BlockGraph, graphDiff, productionGraph, stagingGraph } from './model/project_model_util';
import { BlockPackSpec } from './model/block_pack_spec';
import { throws } from 'node:assert';

type FieldStatus = 'NotReady' | 'Ready' | 'Error';

interface BlockFieldState {
  modCount: number,
  ref: AnyRef;
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
  private futureProductionGraph: BlockGraph | undefined = undefined;
  private actualProductionGraph: BlockGraph | undefined = undefined;

  private getStagingGraph(): BlockGraph {
    if (this.stagingGraph === undefined)
      this.stagingGraph = stagingGraph(this.struct);
    return this.stagingGraph;
  }

  private getBlockInfo(blockId: string): BlockInfo {
    return notEmpty(this.blockInfos.get(blockId));
  }

  private getBlock(blockId: string): Block {
    for (const block of allBlocks(this.struct))
      if (block.id === blockId)
        return block;
    throw new Error('block not found');
  }

  private getFutureProductionGraph(): BlockGraph {
    if (this.futureProductionGraph === undefined)
      this.futureProductionGraph = productionGraph(this.struct,
        blockId => this.getBlockInfo(blockId).currentInputs);
    return this.futureProductionGraph;
  }

  private getActualProductionGraph(): BlockGraph {
    if (this.actualProductionGraph === undefined)
      this.actualProductionGraph = productionGraph(this.struct,
        blockId => this.getBlockInfo(blockId).actualProductionInputs);
    return this.actualProductionGraph;
  }

  public setBlockFieldObj(blockId: string, fieldName: keyof BlockFieldStates,
                          state: Omit<BlockFieldState, 'modCount'>) {
    const fid = field(this.rid, projectFieldName({ blockId, fieldName: fieldName }));

    if (this.getBlockInfo(blockId).fields[fieldName] === undefined)
      this.tx.createField(fid, 'Dynamic', state.ref);
    else
      this.tx.setField(fid, state.ref);

    this.getBlockInfo(blockId).fields[fieldName] = {
      modCount: this.globalModCount++,
      ...state
    };
  }

  public setBlockField(
    blockId: string, fieldName: keyof BlockFieldStates,
    ref: AnyRef, status: FieldStatus, value?: Uint8Array
  ) {
    this.setBlockFieldObj(blockId, fieldName, { ref, status, value });
  }

  public deleteBlockField(blockId: string, fieldName: keyof BlockFieldStates): boolean {
    const fields = this.getBlockInfo(blockId).fields;
    if (!(fieldName in fields))
      return false;
    this.tx.removeField(field(this.rid, projectFieldName({ blockId, fieldName })));
    delete fields[fieldName];
    return true;
  }

  private resetStaging(blockId: string): void {
    const fields = this.getBlockInfo(blockId).fields;
    if (fields.stagingOutput?.status === 'Ready' && fields.stagingCtx?.status === 'Ready') {
      this.setBlockFieldObj(blockId, 'stagingOutputPrevious', fields.stagingOutput);
      this.setBlockFieldObj(blockId, 'stagingCtxPrevious', fields.stagingCtx);
      this.deleteBlockField(blockId, 'stagingOutput');
      this.deleteBlockField(blockId, 'stagingCtx');
    }
    this.renderingState.stagingRefreshTimestamp = Date.now();
    this.renderingStateChanged = true;
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
      const ref = this.tx.createValue(KnownResourceTypes.JsonObject, binary);
      this.setBlockField(blockId, 'currentInputs', ref, 'Ready', binary);
    }

    // resetting staging outputs for all downstream blocks
    this.getStagingGraph().traverse('downstream', requests.map(e => e.blockId),
      ({ id }) => this.resetStaging(id));
  }

  private renderStagingFor(blockId: string) {
    const info = this.getBlockInfo(blockId);
    const block = this.getBlock(blockId);
    const stagingNode = this.getStagingGraph().nodes.get(blockId)!;

    const upstreamContexts: AnyRef[] = [];
    stagingNode.upstream.forEach(id => {
      if (info.fields.stagingCtx === undefined)
        throw new Error('One of the upstreams staging is not rendered.');
      upstreamContexts.push(info.fields.stagingCtx.ref);
    });

    const ctx = createBContextFromUpstreams(this.tx, upstreamContexts);

    if (block.renderingMode !== 'Heavy')
      throw new Error('not supported yet');

    const tpl = this.tx.getFutureFieldValue(
      this.tx.getFutureFieldValue(info.fields.blockPack!.ref, BlockPackHolderMainField, 'Input'),
      BlockPackTemplateField, 'Input'
    );

    const blockIdRes = this.tx.createValue(KnownResourceTypes.JsonString, JSON.stringify(blockId));
    const falseRes = this.tx.createValue(KnownResourceTypes.JsonBool, JSON.stringify(false));

    const results = createRenderHeavyBlock(this.tx, tpl, {
      args: info.fields.currentInputs!.ref,
      blockId: blockIdRes,
      isProduction: falseRes,
      context: ctx
    });
    this.setBlockField(blockId, 'stagingCtx', results.context, 'NotReady');
    this.setBlockField(blockId, 'stagingOutput', results.result, 'NotReady');
  }

  public updateStructure(newStructure: ProjectStructure, newBlockSpecProvider: (blockId: string) => NewBlockSpec = NoNewBlocks) {
    // const newBlockArgsParsed = new Map<string, any>();
    // newBlockArgs.forEach((args, blockId) => newBlockArgsParsed.set(blockId, JSON.parse(args)));

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
      const holder = this.tx.createStruct(BlockPackHolderType);
      const mainHolderField = field(holder, BlockPackHolderMainField);
      this.tx.createField(mainHolderField, 'Input', bp);
      this.tx.lock(holder);
      this.setBlockField(blockId, 'blockPack', holder, 'NotReady');

      // inputs
      const binArgs = Buffer.from(spec.inputs);
      const argsRes = this.tx.createValue(KnownResourceTypes.JsonObject, binArgs);
      this.setBlockField(blockId, 'currentInputs', argsRes, 'Ready', binArgs);
    }

    // resetting stagings affected by topology change
    for (const blockId of stagingDiff.different)
      this.resetStaging(blockId);

    // applying changes due to topology change in production
    for (const blockId of prodDiff.different)
      this.resetOrLimboProduction(blockId);

    this.struct = newStructure;
    this.stagingGraph = undefined;
    this.futureProductionGraph = undefined;
    this.actualProductionGraph = undefined;
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

  public addBlock() {

  }

  public doRefresh() {
    //...
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

    // we never create fields without values
    const ref = ensureResourceIdNotNull(f.value);
    info.fields[projectField.fieldName] = { modCount: 0, ref };
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
      if (!isResource(state.ref) || isResourceRef(state.ref))
        throw new Error('load full state in one go');
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
  blockInfoStates.forEach(({ id, fields }) => new BlockInfo(id, fields));

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

// export function createBlock(tx: PlTransaction,
//                             bpSpec: BlockPackSpec): AnyResourceRef {
//   const block = tx.createEphemeral(Block);
//   tx.lock(block);
//   const bp = createBlockPack(tx, bpSpec);
//   const bpField = field(block, BlockBlockPack);
//   tx.createField(bpField, 'Dynamic');
//   tx.setField(bpField, bp);
//   return block;
// }
//
// export function renderProduction(tx: PlTransaction, prj: ProjectInfo): {
//   result: AnyRef,
//   context: AnyRef,
// }[] {
//   const order = prj.structure.blocks.map(b => b.id);
//   const blocks = order.map(
//     (id) => notEmpty(prj.blocks.get(id))
//   );
//
//   const results = [];
//
//   const isProduction = createBool(tx, true);
//
//   let ctx: AnyRef = createBContextEnd(tx);
//   for (const b of blocks) {
//     const rendered = createRenderHeavyBlock(
//       tx, b.tplId, {
//         args: b.inputsToRender,
//         blockId: b.blockId,
//         isProduction: isProduction,
//         context: ctx
//       }
//     );
//
//     ctx = notEmpty(rendered.context);
//     results.push({
//       result: notEmpty(rendered.result),
//       context: ctx
//     });
//   }
//
//   return results;
// }
