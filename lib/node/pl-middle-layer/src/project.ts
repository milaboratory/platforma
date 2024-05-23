import {
  AnyRef,
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
  SchemaVersionKey
} from './project_model';
import { inferAllReferencedBlocks } from './inputs';
import { toJS } from 'yaml/dist/nodes/toJS';
import { BlockPackTemplateField } from './block_pack';

// export interface BlockInfo {
//   readonly tplId: ResourceRef;
//   readonly inputsToRender: ResourceRef;
//   readonly blockId: ResourceRef;
// }
//
// export interface ProjectInfo {
//   readonly rId: ResourceId;
//   readonly structure: BlockStructure;
//   readonly blocks: Map<string, BlockInfo>;
// }

type FieldStatus = 'NotReady' | 'Ready' | 'Error';

interface BlockFieldState {
  ref: AnyRef;
  status?: FieldStatus;
  value?: Uint8Array;
}

export type BlockFieldStates = Partial<Record<ProjectField['field'], BlockFieldState>>

export interface BlockInfo {
  /** Block id */
  readonly id: string;

  stagingRendered: boolean;

  /** Distance to furthers staging block that is not rendered (1 meaning first not rendered) */
  stagingLag?: number;
  /** Knowing project structure is enough to calculate staging graph */
  stagingUpstream?: Set<string>;
  /** Knowing project structure is enough to calculate staging graph */
  stagingDownstream?: Set<string>;

  /** If loaded */
  currentInputs?: any;
  /** True if missing reference was encountered during future production graph reconstruction */
  missingReferenceInCurrentInputs?: boolean;
  /** Requires inputs */
  futureProductionUpstream?: Set<string>;
  /** Requires inputs */
  futureProductionDownstream?: Set<string>;

  /** If loaded */
  actualProductionInputs?: any;
  /** Requires inputs */
  actualProductionUpstream?: Set<string>;
  /** Requires inputs */
  actualProductionDownstream?: Set<string>;
}

export interface SetInputRequest {
  blockId: string;
  inputs: string;
}

type GraphInfoFields =
  | 'stagingUpstream' | 'stagingDownstream'
  | 'futureProductionUpstream' | 'futureProductionDownstream'
  | 'actualProductionUpstream' | 'actualProductionDownstream'

export class ProjectMutator {
  private structureChanged = false;
  private renderingStateChanged = false;

  private schema?: string;
  private structure?: ProjectStructure;
  private blockInfos?: Map<string, BlockInfo>;
  private renderingState?: ProjectRenderingState;
  private blockFields?: Map<string, BlockFieldStates>;

  /**
   * 0 - nothing is loaded
   * 1 - fields and kv store is loaded
   * 2 - block inputs loaded
   * */
  private loaded = 0;

  /** To prevent concurrent access to the object */
  private loading = false;

  constructor(public readonly rid: ResourceId,
              private readonly tx: PlTransaction
  ) {
  }

  private ensureNotLoading() {
    if (this.loading)
      throw new Error('Concurrent access.');
  }

  private checkMinLoadingLevel(required: number) {
    this.ensureNotLoading();
    if (this.loaded < required)
      throw new Error(`loading level ${required} is required`);
  }

  /** Each subsequent level costs one round-trip */
  public async load(requestLevel: number): Promise<void> {
    if (this.loaded >= requestLevel)
      return;

    this.ensureNotLoading();

    this.loading = true;

    if (this.loaded === 0) {
      const fullResourceStateP = this.tx.getResourceData(this.rid, true);
      const schemaP = this.tx.getKValueJson<string>(this.rid, SchemaVersionKey);
      const structureP = this.tx.getKValueJson<ProjectStructure>(this.rid, BlockStructureKey);
      const renderingStateP = this.tx.getKValueJson<ProjectRenderingState>(this.rid, BlockRenderingStateKey);

      // loading field information
      this.blockFields = new Map();
      const fullResourceState = await fullResourceStateP;
      for (const f of fullResourceState.fields) {
        const projectField = parseProjectField(f.name);

        // processing only fields with known structure
        if (projectField === undefined)
          continue;

        let blockFields = this.blockFields.get(projectField.blockId);
        if (blockFields === undefined) {
          blockFields = {};
          this.blockFields.set(projectField.blockId, blockFields);
        }

        // we never create fields without values
        const ref = ensureResourceIdNotNull(f.value);
        blockFields[projectField.field] = { ref };
      }
      // also initializing blockInfos
      this.blockInfos = new Map();
      this.blockFields.forEach((v, k) => this.blockInfos!.set(k, { id: k, stagingRendered: 'stagingCtx' in v }));

      // loading jsons
      this.schema = await schemaP;
      if (this.schema !== SchemaVersionCurrent)
        throw new Error(`Can't act on this project resource because it has a wrong schema version: ${this.schema}`);
      this.structure = await structureP;
      this.renderingState = await renderingStateP;

      this.loaded = 1;
    }

    if (this.loaded === 1 && requestLevel > 1) {
      const requests: [ProjectField, Promise<BasicResourceData>][] = [];
      this.blockFields!.forEach((v, blockId) => {
        for (const [type, state] of Object.entries(v)) {
          if (!isResource(state.ref) || isResourceRef(state.ref))
            throw new Error('load full state in one go');
          requests.push([{ field: type, blockId } as ProjectField, this.tx.getResourceData(state.ref, false)]);
        }
      });
      for (const [f, r] of requests) {
        const result = await r;
        const state = this.blockFields!.get(f.blockId)![f.field]!;
        state.value = result.data;
        if (isNotNullResourceId(result.error))
          state.status = 'Error';
        else if (result.resourceReady || isNotNullResourceId(result.originalResourceId))
          state.status = 'Ready';
        else
          state.status = 'NotReady';
      }
      this.blockInfos!.forEach(info => {
        info.currentInputs = Buffer.from(this.blockFields!.get(info.id)!.currentInputs!.value!).toString();
        if (this.blockFields!.get(info.id)!.prodInputs !== undefined)
          info.actualProductionInputs = Buffer.from(this.blockFields!.get(info.id)!.prodInputs!.value!).toString();
      });

      this.loaded = 2;
    }


    this.loading = false;
  }

  //
  // Graph calculation
  //

  private stagingGraphReady = false;

  private ensureStagingGraph() {
    if (this.stagingGraphReady)
      return;

    this.checkMinLoadingLevel(1);

    // Simple dependency graph from previous to next
    //
    //   more complicated patterns to be implemented later
    //   (i.e. groups with specific behaviours for total outputs and inputs)
    //
    let previous: BlockInfo | undefined = undefined;
    const infos = this.blockInfos!;
    let stagingLag: number = 0;
    for (const g of this.structure!.groups) {
      for (const b of g.blocks) {
        const current = notEmpty(infos.get(b.id));
        if (previous === undefined) {
          current.stagingUpstream = new Set<string>();
        } else {
          previous.stagingDownstream = new Set<string>([current.id]);
          current.stagingUpstream = new Set<string>([previous.id]);
        }

        if (current.stagingRendered)
          stagingLag = 0;
        else
          stagingLag++;
        current.stagingLag = stagingLag;

        previous = current;
      }
    }
    if (previous !== undefined)
      previous.stagingDownstream = new Set<string>();

    this.stagingGraphReady = true;
  }

  private futureProductionGraphReady = false;

  private ensureFutureProductionGraph() {
    if (this.futureProductionGraphReady)
      return;
    this.checkMinLoadingLevel(2);
    this.recalculateProductionGraph(
      'currentInputs', 'futureProductionUpstream', 'futureProductionDownstream',
      'missingReferenceInCurrentInputs'
    );
    this.futureProductionGraphReady = true;
  }

  private actualProductionGraphReady = false;

  private ensureActualProductionGraph() {
    if (this.actualProductionGraphReady)
      return;
    this.checkMinLoadingLevel(2);
    this.recalculateProductionGraph('actualProductionInputs', 'actualProductionUpstream', 'actualProductionDownstream');
    this.actualProductionGraphReady = true;
  }


  private recalculateProductionGraph(inputsField: 'currentInputs' | 'actualProductionInputs',
                                     upstreamField: 'futureProductionUpstream' | 'actualProductionUpstream',
                                     downstreamField: 'futureProductionDownstream' | 'actualProductionDownstream',
                                     missingRefField?: 'missingReferenceInCurrentInputs') {
    const infos = this.blockInfos!;

    // traversing blocks in topological order defined by the project structure
    // and keeping possibleUpstreams set on each step, to consider only
    // those dependencies that are possible under current topology
    const possibleUpstreams = new Set<string>();
    for (const g of this.structure!.groups) {
      for (const b of g.blocks) {
        const info = notEmpty(infos.get(b.id));
        const upstreams = inferAllReferencedBlocks(info[inputsField], possibleUpstreams);
        info[upstreamField] = upstreams.upstreams;
        if (missingRefField !== undefined)
          info[missingRefField] = upstreams.missingReferences;
        info[downstreamField] = new Set<string>(); // will be populated from downstream blocks
        upstreams.upstreams.forEach(dep => infos.get(dep)![downstreamField]!.add(info.id));
        possibleUpstreams.add(info.id);
      }
    }
  }

  private getBlock(blockId: string): Block {
    for (const group of this.structure!.groups)
      for (const block of group.blocks)
        if (block.id === blockId)
          return block;
    throw new Error('block not found');
  }

  private getBlockInfo(blockId: string): BlockInfo {
    return notEmpty(this.blockInfos!.get(blockId));
  }

  private getBlockFields(blockId: string): BlockFieldStates {
    return notEmpty(this.blockFields!.get(blockId));
  }

  public setBlockFieldObj(blockId: string, fieldName: keyof BlockFieldStates,
                          state: BlockFieldState) {
    this.tx.setField(field(this.rid, projectFieldName({ blockId, field: fieldName })), state.ref);
    this.getBlockFields(blockId)[fieldName] = state;
  }

  public setBlockField(
    blockId: string, fieldName: keyof BlockFieldStates,
    ref: AnyRef, status: FieldStatus, value?: Uint8Array
  ) {
    this.setBlockFieldObj(blockId, fieldName, { ref, status, value });
  }

  public deleteBlockField(blockId: string, fieldName: keyof BlockFieldStates): boolean {
    const fields = this.getBlockFields(blockId);
    if (!(fieldName in fields))
      return false;
    this.tx.removeField(field(this.rid, projectFieldName({ blockId, field: fieldName })));
    delete fields[fieldName];
    return true;
  }

  public traverseAll(field: GraphInfoFields,
                     rootBlockIds: string[],
                     cb: (info: BlockInfo) => void): void {

    switch (field) {
      case 'stagingUpstream':
      case 'stagingDownstream':
        this.ensureStagingGraph();
        break;
      case 'futureProductionUpstream':
      case 'futureProductionDownstream':
        this.ensureFutureProductionGraph();
        break;
      case 'actualProductionUpstream':
      case 'actualProductionDownstream':
        this.ensureActualProductionGraph();
        break;
    }

    let unprocessed = rootBlockIds;
    // used to deduplicate possible downstream blocks and process them only once
    const queued = new Set<string>(unprocessed);
    while (unprocessed.length > 0) {
      let nextUnprocessed: string[] = [];
      for (const blockId of unprocessed) {
        const info = this.getBlockInfo(blockId);
        cb(info);
        info[field]!.forEach(v => {
          if (!queued.has(v)) {
            queued.add(v);
            nextUnprocessed.push(v);
          }
        });
      }
      unprocessed = nextUnprocessed;
    }
  }

  /** Optimally sets inputs for multiple blocks in one turn */
  public setInputs(requests: SetInputRequest[]) {
    this.checkMinLoadingLevel(2);

    for (const { blockId, inputs } of requests) {
      const info = this.getBlockInfo(blockId);
      const parsedInputs = JSON.parse(inputs);
      const binary = Buffer.from(inputs);
      const ref = this.tx.createValue(KnownResourceTypes.JsonObject, binary);
      this.setBlockField(blockId, 'currentInputs', ref, 'Ready', binary);
      info.currentInputs = parsedInputs;
    }
    this.futureProductionGraphReady = false;

    // resetting staging outputs for all downstream blocks
    this.traverseAll('stagingDownstream', requests.map(e => e.blockId),
      info => {
        const fields = this.getBlockFields(info.id);
        if (fields.stagingOutput?.status === 'Ready' && fields.stagingCtx?.status === 'Ready') {
          this.setBlockFieldObj(info.id, 'stagingOutputPrevious', fields.stagingOutput);
          this.setBlockFieldObj(info.id, 'stagingCtxPrevious', fields.stagingCtx);
          this.deleteBlockField(info.id, 'stagingOutput');
          this.deleteBlockField(info.id, 'stagingCtx');
        }
      });
    this.stagingGraphReady = false; // to recalculate stagingLags

    // mark a timestamp we did the reset
    this.renderingState!.stagingRefreshTimestamp = Date.now();
    this.renderingStateChanged = true;
  }

  private renderStagingFor(blockId: string) {
    this.checkMinLoadingLevel(2);

    const info = this.getBlockInfo(blockId);
    const fields = this.getBlockFields(blockId);
    const block = this.getBlock(blockId);

    const upstreamContexts: AnyRef[] = [];
    info.stagingUpstream!.forEach(id => {
      const upstreamFields = this.getBlockFields(id);
      if (upstreamFields.stagingCtx === undefined)
        throw new Error('One of the upstreams staging is not rendered.');
      upstreamContexts.push(upstreamFields.stagingCtx.ref);
    });

    const ctx = createBContextFromUpstreams(this.tx, upstreamContexts);

    if (block.renderingMode !== 'Heavy')
      throw new Error('not supported yet');

    const tpl = this.tx.getFutureFieldValue(
      this.tx.getFutureFieldValue(fields.blockPack!.ref, BlockPackHolderMainField, 'Input'),
      BlockPackTemplateField, 'Input'
    );

    const blockIdRes = this.tx.createValue(KnownResourceTypes.JsonString, JSON.stringify(blockId));
    const falseRes = this.tx.createValue(KnownResourceTypes.JsonBool, JSON.stringify(false));

    const results = createRenderHeavyBlock(this.tx, tpl, {
      args: fields.currentInputs!.ref,
      blockId: blockIdRes,
      isProduction: falseRes,
      context: ctx
    });
    this.setBlockField(blockId, 'stagingCtx', results.context, 'NotReady');
    this.setBlockField(blockId, 'stagingOutput', results.result, 'NotReady');
  }

  public updateStructure(newStructure: ProjectStructure) {

  }

  public addBlock() {

  }

  public doRefresh() {
    //...
  }
}

// export function createProject(tx: PlTransaction): AnyResourceRef {
//   const prj = tx.createEphemeral(ProjectResourceType);
//   tx.lock(prj);
//   tx.setKValue(prj, SchemaVersionKey, String(SchemaVersionCurrent));
//   tx.setKValue(prj, BlockStructureKey, JSON.stringify(InitialBlockStructure));
//   return prj;
// }
//
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
