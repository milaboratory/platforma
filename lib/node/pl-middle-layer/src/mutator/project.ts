import type {
  AnyRef,
  AnyResourceRef,
  BasicResourceData,
  PlTransaction,
  ResourceData,
  ResourceId } from '@milaboratories/pl-client';
import {
  ensureResourceIdNotNull,
  field,
  isNotNullResourceId,
  isNullResourceId,
  isResource,
  isResourceId,
  isResourceRef,
  Pl,
  PlClient,
} from '@milaboratories/pl-client';
import { createRenderHeavyBlock, createBContextFromUpstreams } from './template/render_block';
import type {
  Block,
  ProjectStructure,
  ProjectField,
  ProjectRenderingState } from '../model/project_model';
import {
  BlockRenderingStateKey,
  ProjectStructureKey,
  parseProjectField,
  projectFieldName,
  SchemaVersionCurrent,
  SchemaVersionKey,
  ProjectResourceType,
  InitialBlockStructure,
  InitialProjectRenderingState,
  ProjectMetaKey,
  InitialBlockMeta,
  blockArgsAuthorKey,
  ProjectLastModifiedTimestamp,
  ProjectCreatedTimestamp,
  ProjectStructureAuthorKey,
  getServiceTemplateField,
  FieldsToDuplicate,
} from '../model/project_model';
import { BlockPackTemplateField, createBlockPack } from './block-pack/block_pack';
import type {
  BlockGraph,
  ProductionGraphBlockInfo } from '../model/project_model_util';
import {
  allBlocks,
  graphDiff,
  productionGraph,
  stagingGraph,
} from '../model/project_model_util';
import type { BlockPackSpecPrepared } from '../model';
import type {
  AuthorMarker,
  BlockPackSpec,
  BlockSettings,
  ProjectMeta,
} from '@milaboratories/pl-model-middle-layer';
import {
  InitialBlockSettings,
} from '@milaboratories/pl-model-middle-layer';
import Denque from 'denque';
import { exportContext, getPreparedExportTemplateEnvelope } from './context_export';
import { loadTemplate } from './template/template_loading';
import { cachedDeserialize, notEmpty, canonicalJsonGzBytes, canonicalJsonBytes } from '@milaboratories/ts-helpers';
import type { ProjectHelper } from '../model/project_helper';
import { extractConfig, UiError, type BlockConfig } from '@platforma-sdk/model';
import { getDebugFlags } from '../debug';
import type { BlockPackInfo } from '../model/block_pack';

type FieldStatus = 'NotReady' | 'Ready' | 'Error';

interface BlockFieldState {
  modCount: number;
  ref?: AnyRef;
  status?: FieldStatus;
  value?: Uint8Array;
}

type BlockFieldStates = Partial<Record<ProjectField['fieldName'], BlockFieldState>>;
type BlockFieldStateValue = Omit<BlockFieldState, 'modCount'>;

interface BlockInfoState {
  readonly id: string;
  readonly fields: BlockFieldStates;
  blockConfig?: BlockConfig;
  blockPack?: BlockPackSpec;
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
      return value;
    }
    const currentModId = modIdCb();
    if (lastModId !== currentModId) {
      lastModId = currentModId;
      value = valueCb();
    }
    return valueCb();
  };
}

class BlockInfo {
  constructor(
    public readonly id: string,
    public readonly fields: BlockFieldStates,
    public readonly config: BlockConfig,
    public readonly source: BlockPackSpec,
  ) {}

  public check() {
    // state assertions

    if ((this.fields.prodOutput === undefined) !== (this.fields.prodCtx === undefined))
      throw new Error('inconsistent prod fields');

    if ((this.fields.stagingOutput === undefined) !== (this.fields.stagingCtx === undefined))
      throw new Error('inconsistent stage fields');

    if (
      (this.fields.prodOutputPrevious === undefined)
      !== (this.fields.prodCtxPrevious === undefined)
    )
      throw new Error('inconsistent prod cache fields');

    if (
      (this.fields.stagingOutputPrevious === undefined)
      !== (this.fields.stagingCtxPrevious === undefined)
    )
      throw new Error('inconsistent stage cache fields');

    if (this.fields.blockPack === undefined) throw new Error('no block pack field');

    if (this.fields.currentArgs === undefined) throw new Error('no current args field');
  }

  private readonly currentArgsC = cached(
    () => this.fields.currentArgs!.modCount,
    () => cachedDeserialize(this.fields.currentArgs!.value!),
  );

  private readonly prodArgsC = cached(
    () => this.fields.prodArgs?.modCount,
    () => {
      const bin = this.fields.prodArgs?.value;
      if (bin === undefined) return undefined;
      return cachedDeserialize(bin);
    },
  );

  get currentArgs(): unknown {
    return this.currentArgsC();
  }

  get stagingRendered(): boolean {
    return this.fields.stagingCtx !== undefined;
  }

  get productionRendered(): boolean {
    return this.fields.prodCtx !== undefined;
  }

  get productionHasErrors(): boolean {
    return this.fields.prodUiCtx?.status === 'Error';
  }

  private readonly productionStaleC: () => boolean = cached(
    () => `${this.fields.currentArgs!.modCount}_${this.fields.prodArgs?.modCount}`,
    () =>
      this.fields.prodArgs === undefined
      || Buffer.compare(this.fields.currentArgs!.value!, this.fields.prodArgs.value!) !== 0,
  );

  // get productionStale(): boolean {
  //   return this.productionRendered && this.productionStaleC() && ;
  // }

  get requireProductionRendering(): boolean {
    return !this.productionRendered || this.productionStaleC() || this.productionHasErrors;
  }

  get prodArgs(): unknown {
    return this.prodArgsC();
  }

  public getTemplate(tx: PlTransaction): AnyRef {
    return tx.getFutureFieldValue(
      Pl.unwrapHolder(tx, this.fields.blockPack!.ref!),
      BlockPackTemplateField,
      'Input',
    );
  }
}

export interface NewBlockSpec {
  blockPack: BlockPackSpecPrepared;
  args: string;
  uiState: string;
}

const NoNewBlocks = (blockId: string) => {
  throw new Error(`No new block info for ${blockId}`);
};

export interface SetStatesRequest {
  blockId: string;
  args?: unknown;
  uiState?: unknown;
}

type _GraphInfoFields =
  | 'stagingUpstream'
  | 'stagingDownstream'
  | 'futureProductionUpstream'
  | 'futureProductionDownstream'
  | 'actualProductionUpstream'
  | 'actualProductionDownstream';

export type ArgsAndUiState = {
  args: unknown;
  uiState: unknown;
};

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

  /** Set blocks will be assigned current mutator author marker on save */
  private readonly blocksWithChangedInputs = new Set<string>();

  constructor(
    public readonly rid: ResourceId,
    private readonly tx: PlTransaction,
    private readonly author: AuthorMarker | undefined,
    private readonly schema: string,
    private lastModified: number,
    private meta: ProjectMeta,
    private struct: ProjectStructure,
    private readonly renderingState: Omit<ProjectRenderingState, 'blocksInLimbo'>,
    private readonly blocksInLimbo: Set<string>,
    private readonly blockInfos: Map<string, BlockInfo>,
    private readonly ctxExportTplHolder: AnyResourceRef,
    private readonly projectHelper: ProjectHelper,
  ) {}

  private fixProblemsAndMigrate() {
    // Fixing problems introduced by old code
    this.blockInfos.forEach((blockInfo) => {
      if (
        blockInfo.fields.prodArgs === undefined
        || blockInfo.fields.prodOutput === undefined
        || blockInfo.fields.prodCtx === undefined
      )
        this.deleteBlockFields(blockInfo.id, 'prodArgs', 'prodOutput', 'prodCtx');
    });

    // Migration for addition of block settings field
    let initialBlockSettings: Omit<BlockFieldState, 'modCount'> | undefined;
    this.blockInfos.forEach((blockInfo) => {
      if (blockInfo.fields.blockSettings === undefined) {
        if (initialBlockSettings === undefined)
          initialBlockSettings = this.createJsonFieldValue(InitialBlockSettings);
        this.setBlockFieldObj(blockInfo.id, 'blockSettings', initialBlockSettings);
      }
    });
  }

  get wasModified(): boolean {
    return (
      this.lastModifiedChanged
      || this.structureChanged
      || this.fieldsChanged
      || this.metaChanged
      || this.renderingStateChanged
    );
  }

  get structure(): ProjectStructure {
    // clone
    return JSON.parse(JSON.stringify(this.struct)) as ProjectStructure;
  }

  //
  // Graph calculation
  //

  private stagingGraph: BlockGraph | undefined = undefined;
  private pendingProductionGraph: BlockGraph | undefined = undefined;
  private actualProductionGraph: BlockGraph | undefined = undefined;

  private getStagingGraph(): BlockGraph {
    if (this.stagingGraph === undefined) this.stagingGraph = stagingGraph(this.struct);
    return this.stagingGraph;
  }

  private getProductionGraphBlockInfo(blockId: string, prod: boolean): ProductionGraphBlockInfo | undefined {
    const bInfo = this.getBlockInfo(blockId);

    let argsField: BlockFieldState;
    let args: unknown;

    if (prod) {
      if (bInfo.fields.prodArgs === undefined) return undefined;
      argsField = bInfo.fields.prodArgs;
      args = bInfo.prodArgs;
    } else {
      argsField = notEmpty(bInfo.fields.currentArgs);
      args = bInfo.currentArgs;
    }

    const blockPackField = notEmpty(bInfo.fields.blockPack);

    if (isResourceId(argsField.ref!) && isResourceId(blockPackField.ref!))
      return {
        args,
        enrichmentTargets: this.projectHelper.getEnrichmentTargets(() => bInfo.config, () => args,
          { argsRid: argsField.ref, blockPackRid: blockPackField.ref }),
      };
    else
      return {
        args,
        enrichmentTargets: this.projectHelper.getEnrichmentTargets(() => bInfo.config, () => args),
      };
  }

  private getPendingProductionGraph(): BlockGraph {
    if (this.pendingProductionGraph === undefined)
      this.pendingProductionGraph = productionGraph(
        this.struct,
        (blockId) => this.getProductionGraphBlockInfo(blockId, false),
      );
    return this.pendingProductionGraph;
  }

  private getActualProductionGraph(): BlockGraph {
    if (this.actualProductionGraph === undefined)
      this.actualProductionGraph = productionGraph(
        this.struct,
        (blockId) => this.getProductionGraphBlockInfo(blockId, true),
      );
    return this.actualProductionGraph;
  }

  //
  // Generic helpers to interact with project state
  //

  private getBlockInfo(blockId: string): BlockInfo {
    const info = this.blockInfos.get(blockId);
    if (info === undefined) throw new Error(`No such block: ${blockId}`);
    return info;
  }

  private createJsonFieldValueByContent(content: string): BlockFieldStateValue {
    const value = Buffer.from(content);
    const ref = this.tx.createValue(Pl.JsonObject, value);
    return { ref, value, status: 'Ready' };
  }

  private createJsonFieldValue(obj: unknown): BlockFieldStateValue {
    return this.createJsonFieldValueByContent(JSON.stringify(obj));
  }

  private getBlock(blockId: string): Block {
    for (const block of allBlocks(this.struct)) if (block.id === blockId) return block;
    throw new Error('block not found');
  }

  private setBlockFieldObj(
    blockId: string,
    fieldName: keyof BlockFieldStates,
    state: BlockFieldStateValue,
  ) {
    const fid = field(this.rid, projectFieldName(blockId, fieldName));

    if (state.ref === undefined) throw new Error('Can\'t set value with empty ref');

    if (this.getBlockInfo(blockId).fields[fieldName] === undefined)
      this.tx.createField(fid, 'Dynamic', state.ref);
    else this.tx.setField(fid, state.ref);

    this.getBlockInfo(blockId).fields[fieldName] = {
      modCount: this.globalModCount++,
      ...state,
    };

    this.fieldsChanged = true;
  }

  private setBlockField(
    blockId: string,
    fieldName: keyof BlockFieldStates,
    ref: AnyRef,
    status: FieldStatus,
    value?: Uint8Array,
  ) {
    this.setBlockFieldObj(blockId, fieldName, { ref, status, value });
  }

  private deleteBlockFields(blockId: string, ...fieldNames: (keyof BlockFieldStates)[]): boolean {
    let deleted = false;
    const info = this.getBlockInfo(blockId);
    for (const fieldName of fieldNames) {
      const fields = info.fields;
      if (!(fieldName in fields)) continue;
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
    if (
      fields.stagingOutput?.status === 'Ready'
      && fields.stagingCtx?.status === 'Ready'
      && fields.stagingUiCtx?.status === 'Ready'
    ) {
      this.setBlockFieldObj(blockId, 'stagingOutputPrevious', fields.stagingOutput);
      this.setBlockFieldObj(blockId, 'stagingCtxPrevious', fields.stagingCtx);
      this.setBlockFieldObj(blockId, 'stagingUiCtxPrevious', fields.stagingUiCtx);
    }
    if (this.deleteBlockFields(blockId, 'stagingOutput', 'stagingCtx', 'stagingUiCtx'))
      this.resetStagingRefreshTimestamp();
  }

  private resetProduction(blockId: string): void {
    const fields = this.getBlockInfo(blockId).fields;
    if (
      fields.prodOutput?.status === 'Ready'
      && fields.prodCtx?.status === 'Ready'
      && fields.prodUiCtx?.status === 'Ready'
    ) {
      this.setBlockFieldObj(blockId, 'prodOutputPrevious', fields.prodOutput);
      this.setBlockFieldObj(blockId, 'prodCtxPrevious', fields.prodCtx);
      this.setBlockFieldObj(blockId, 'prodUiCtxPrevious', fields.prodUiCtx);
    }
    this.deleteBlockFields(blockId, 'prodOutput', 'prodCtx', 'prodUiCtx', 'prodArgs');
  }

  /** Running blocks are reset, already computed moved to limbo. Returns if
   * either of the actions were actually performed.
   * This method ensures the block is left in a consistent state that passes check() constraints. */
  private resetOrLimboProduction(blockId: string): boolean {
    const fields = this.getBlockInfo(blockId).fields;

    // Check if we can safely move to limbo (both core production fields are ready)
    if (fields.prodOutput?.status === 'Ready' && fields.prodCtx?.status === 'Ready') {
      if (this.blocksInLimbo.has(blockId))
        // we are already in limbo
        return false;

      // limbo - keep the ready production results but clean up cache
      this.blocksInLimbo.add(blockId);
      this.renderingStateChanged = true;

      // doing some gc - clean up previous cache fields
      this.deleteBlockFields(blockId, 'prodOutputPrevious', 'prodCtxPrevious', 'prodUiCtxPrevious');

      return true;
    } else {
      // reset - clean up any partial/inconsistent production stat
      return this.deleteBlockFields(
        blockId,
        'prodOutput',
        'prodCtx',
        'prodUiCtx',
        'prodArgs',
        'prodOutputPrevious',
        'prodCtxPrevious',
        'prodUiCtxPrevious',
      );
    }
  }

  /** Optimally sets inputs for multiple blocks in one go */
  public setStates(requests: SetStatesRequest[]) {
    const changedArgs: string[] = [];
    let somethingChanged = false;
    for (const req of requests) {
      const info = this.getBlockInfo(req.blockId);
      let blockChanged = false;
      for (const stateKey of ['args', 'uiState'] as const) {
        if (!(stateKey in req)) continue;
        const statePart = req[stateKey];
        if (statePart === undefined || statePart === null)
          throw new Error(
            `Can't set ${stateKey} to null or undefined, please omit the key if you don't want to change it`,
          );

        const fieldName = stateKey === 'args' ? 'currentArgs' : 'uiState';

        let data: Uint8Array;
        let gzipped: boolean = false;
        if (stateKey === 'args') {
          // don't gzip args, workflow code can't uncompress gzip yet
          data = canonicalJsonBytes(statePart);
        } else {
          const { data: binary, isGzipped } = canonicalJsonGzBytes(statePart);
          data = binary;
          gzipped = isGzipped;
        }
        if (Buffer.compare(info.fields[fieldName]!.value!, data) === 0) continue;
        console.log('setting', fieldName, gzipped, data.length);
        const statePartRef = this.tx.createValue(gzipped ? Pl.JsonGzObject : Pl.JsonObject, data);
        this.setBlockField(req.blockId, fieldName, statePartRef, 'Ready', data);

        blockChanged = true;
        if (stateKey === 'args') changedArgs.push(req.blockId);
      }
      if (blockChanged) {
        // will be assigned our author marker
        this.blocksWithChangedInputs.add(req.blockId);
        somethingChanged = true;
      }
    }

    // resetting staging outputs for all downstream blocks
    this.getStagingGraph().traverse('downstream', changedArgs, ({ id }) => this.resetStaging(id));

    if (somethingChanged) this.updateLastModified();
  }

  public setBlockSettings(blockId: string, newValue: BlockSettings): void {
    this.setBlockFieldObj(blockId, 'blockSettings', this.createJsonFieldValue(newValue));
    this.updateLastModified();
  }

  private createProdCtx(upstream: Set<string>): AnyRef {
    const upstreamContexts: AnyRef[] = [];
    upstream.forEach((id) => {
      const info = this.getBlockInfo(id);
      if (info.fields['prodCtx']?.ref === undefined)
        throw new Error('One of the upstreams staging is not rendered.');
      upstreamContexts.push(Pl.unwrapHolder(this.tx, info.fields['prodCtx'].ref));
    });
    return createBContextFromUpstreams(this.tx, upstreamContexts);
  }

  private createStagingCtx(upstream: Set<string>): AnyRef {
    const upstreamContexts: AnyRef[] = [];
    upstream.forEach((id) => {
      const info = this.getBlockInfo(id);
      if (info.fields['stagingCtx']?.ref === undefined)
        throw new Error('One of the upstreams staging is not rendered.');
      upstreamContexts.push(Pl.unwrapHolder(this.tx, info.fields['stagingCtx'].ref));
      if (info.fields['prodCtx']?.ref !== undefined)
        upstreamContexts.push(Pl.unwrapHolder(this.tx, info.fields['prodCtx'].ref));
    });
    return createBContextFromUpstreams(this.tx, upstreamContexts);
  }

  private exportCtx(ctx: AnyRef): AnyRef {
    return exportContext(this.tx, Pl.unwrapHolder(this.tx, this.ctxExportTplHolder), ctx);
  }

  private renderStagingFor(blockId: string) {
    this.resetStaging(blockId);

    const info = this.getBlockInfo(blockId);

    const ctx = this.createStagingCtx(this.getStagingGraph().nodes.get(blockId)!.upstream);

    if (this.getBlock(blockId).renderingMode !== 'Heavy') throw new Error('not supported yet');

    const tpl = info.getTemplate(this.tx);

    const results = createRenderHeavyBlock(this.tx, tpl, {
      args: info.fields.currentArgs!.ref!,
      blockId: this.tx.createValue(Pl.JsonString, JSON.stringify(blockId)),
      isProduction: this.tx.createValue(Pl.JsonBool, JSON.stringify(false)),
      context: ctx,
    });

    this.setBlockField(
      blockId,
      'stagingCtx',
      Pl.wrapInEphHolder(this.tx, results.context),
      'NotReady',
    );

    this.setBlockField(blockId, 'stagingUiCtx', this.exportCtx(results.context), 'NotReady');

    this.setBlockField(blockId, 'stagingOutput', results.result, 'NotReady');
  }

  private renderProductionFor(blockId: string) {
    this.resetProduction(blockId);

    const info = this.getBlockInfo(blockId);

    const ctx = this.createProdCtx(this.getPendingProductionGraph().nodes.get(blockId)!.upstream);

    if (this.getBlock(blockId).renderingMode === 'Light')
      throw new Error('Can\'t render production for light block.');

    const tpl = info.getTemplate(this.tx);

    const results = createRenderHeavyBlock(this.tx, tpl, {
      args: info.fields.currentArgs!.ref!,
      blockId: this.tx.createValue(Pl.JsonString, JSON.stringify(blockId)),
      isProduction: this.tx.createValue(Pl.JsonBool, JSON.stringify(true)),
      context: ctx,
    });
    this.setBlockField(
      blockId,
      'prodCtx',
      Pl.wrapInEphHolder(this.tx, results.context),
      'NotReady',
    );
    this.setBlockField(blockId, 'prodUiCtx', this.exportCtx(results.context), 'NotReady');
    this.setBlockField(blockId, 'prodOutput', results.result, 'NotReady');

    // saving inputs for which we rendered the production
    this.setBlockFieldObj(blockId, 'prodArgs', info.fields.currentArgs!);

    // removing block from limbo as we juts rendered fresh production for it
    if (this.blocksInLimbo.delete(blockId)) this.renderingStateChanged = true;
  }

  //
  // Structure changes
  //

  private initializeNewBlock(blockId: string, spec: NewBlockSpec): void {
    const info = new BlockInfo(blockId, {}, extractConfig(spec.blockPack.config), spec.blockPack.source);
    this.blockInfos.set(blockId, info);

    // block pack
    const bp = createBlockPack(this.tx, spec.blockPack);
    this.setBlockField(blockId, 'blockPack', Pl.wrapInHolder(this.tx, bp), 'NotReady');

    // settings
    this.setBlockFieldObj(
      blockId,
      'blockSettings',
      this.createJsonFieldValue(InitialBlockSettings),
    );

    // args
    this.setBlockFieldObj(blockId, 'currentArgs', this.createJsonFieldValueByContent(spec.args));

    // uiState
    this.setBlockFieldObj(blockId, 'uiState', this.createJsonFieldValueByContent(spec.uiState ?? '{}'));

    // checking structure
    info.check();
  }

  private getFieldNamesToDuplicate(blockId: string): Set<ProjectField['fieldName']> {
    const fields = this.getBlockInfo(blockId).fields;

    const diff = <T>(setA: Set<T>, setB: Set<T>): Set<T> => new Set([...setA].filter((x) => !setB.has(x)));

    // Check if we can safely move to limbo (both core production fields are ready)
    if (fields.prodOutput?.status === 'Ready' && fields.prodCtx?.status === 'Ready') {
      if (this.blocksInLimbo.has(blockId))
        // we are already in limbo
        return FieldsToDuplicate;

      return diff(FieldsToDuplicate, new Set([
        'prodOutputPrevious',
        'prodCtxPrevious',
        'prodUiCtxPrevious',
      ]));
    } else {
      return diff(FieldsToDuplicate, new Set([
        'prodOutput',
        'prodCtx',
        'prodUiCtx',
        'prodArgs',
        'prodOutputPrevious',
        'prodCtxPrevious',
        'prodUiCtxPrevious',
      ]));
    }
  }

  private initializeBlockDuplicate(blockId: string, originalBlockInfo: BlockInfo) {
    const info = new BlockInfo(
      blockId,
      {},
      originalBlockInfo.config,
      originalBlockInfo.source,
    );

    this.blockInfos.set(blockId, info);

    const fieldNamesToDuplicate = this.getFieldNamesToDuplicate(blockId);

    // Copy all fields from original block to new block by sharing references
    for (const [fieldName, fieldState] of Object.entries(originalBlockInfo.fields)) {
      if (fieldNamesToDuplicate.has(fieldName as ProjectField['fieldName']) && fieldState && fieldState.ref) {
        this.setBlockFieldObj(blockId, fieldName as keyof BlockFieldStates, {
          ref: fieldState.ref,
          status: fieldState.status,
          value: fieldState.value,
        });
      }
    }

    this.resetOrLimboProduction(blockId);

    info.check();
  }

  /** Very generic method, better check for more specialized case-specific methods first. */
  public updateStructure(
    newStructure: ProjectStructure,
    newBlockInitializer: (blockId: string) => void = NoNewBlocks,
  ): void {
    const currentStagingGraph = this.getStagingGraph();
    const currentActualProductionGraph = this.getActualProductionGraph();

    const newStagingGraph = stagingGraph(newStructure);

    const stagingDiff = graphDiff(currentStagingGraph, newStagingGraph);

    // removing blocks
    for (const blockId of stagingDiff.onlyInA) {
      const { fields } = this.getBlockInfo(blockId);
      this.deleteBlockFields(blockId, ...(Object.keys(fields) as ProjectField['fieldName'][]));
      this.blockInfos.delete(blockId);
      if (this.blocksInLimbo.delete(blockId)) this.renderingStateChanged = true;
    }

    // creating new blocks
    for (const blockId of stagingDiff.onlyInB) {
      newBlockInitializer(blockId);
    }

    // resetting stagings affected by topology change
    for (const blockId of stagingDiff.different) this.resetStaging(blockId);

    // new actual production graph without new blocks
    const newActualProductionGraph = productionGraph(
      newStructure,
      (blockId) => this.getProductionGraphBlockInfo(blockId, true),
    );

    const prodDiff = graphDiff(currentActualProductionGraph, newActualProductionGraph);

    // applying changes due to topology change in production to affected nodes and
    // all their downstreams
    currentActualProductionGraph.traverse('downstream', [...prodDiff.different], (node) => {
      this.resetOrLimboProduction(node.id);
    });

    if (
      stagingDiff.onlyInB.size > 0
      || stagingDiff.onlyInA.size > 0
      || stagingDiff.different.size > 0
    )
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
        const idx = group.blocks.findIndex((b) => b.id === before);
        if (idx < 0) continue;
        group.blocks.splice(idx, 0, block);
        done = true;
        break;
      }
      if (!done) throw new Error(`Can't find element with id: ${before}`);
    }
    this.updateStructure(newStruct, (blockId) => {
      if (blockId !== block.id) throw new Error('Unexpected');
      this.initializeNewBlock(blockId, spec);
    });
  }

  /**
   * Duplicates an existing block by copying all its fields and structure.
   * This method creates a deep copy of the block at the mutator level.
   *
   * @param originalBlockId id of the block to duplicate
   * @param newBlockId id for the new duplicated block
   * @param after id of the block to insert new block after
   */
  public duplicateBlock(originalBlockId: string, newBlockId: string, after?: string): void {
    // Get the original block from structure
    const originalBlock = this.getBlock(originalBlockId);
    const originalBlockInfo = this.getBlockInfo(originalBlockId);

    // Create new block in structure
    const newBlock: Block = {
      id: newBlockId,
      label: originalBlock.label,
      renderingMode: originalBlock.renderingMode,
    };

    // Add the new block to structure
    const newStruct = this.structure; // copy current structure
    if (after === undefined) {
      // adding as a very last block
      newStruct.groups[newStruct.groups.length - 1].blocks.push(newBlock);
    } else {
      let done = false;
      for (const group of newStruct.groups) {
        const idx = group.blocks.findIndex((b) => b.id === after);
        if (idx < 0) continue;
        group.blocks.splice(idx + 1, 0, newBlock);
        done = true;
        break;
      }
      if (!done) throw new Error(`Can't find element with id: ${after}`);
    }

    this.updateStructure(newStruct, (blockId) => {
      if (blockId !== newBlockId) throw new Error('Unexpected');
      this.initializeBlockDuplicate(blockId, originalBlockInfo);
    });
  }

  public deleteBlock(blockId: string): void {
    const newStruct = this.structure; // copy current structure
    let done = false;
    for (const group of newStruct.groups) {
      const idx = group.blocks.findIndex((b) => b.id === blockId);
      if (idx < 0) continue;
      group.blocks.splice(idx, 1);
      done = true;
      break;
    }
    if (!done) throw new Error(`Can't find element with id: ${blockId}`);
    this.updateStructure(newStruct);
  }

  //
  // Block-pack migration
  //

  public migrateBlockPack(blockId: string, spec: BlockPackSpecPrepared, newArgsAndUiState?: ArgsAndUiState): void {
    const info = this.getBlockInfo(blockId);

    this.setBlockField(
      blockId,
      'blockPack',
      Pl.wrapInHolder(this.tx, createBlockPack(this.tx, spec)),
      'NotReady',
    );

    if (newArgsAndUiState !== undefined) {
      // this will also reset all downstream stagings
      this.setStates([{ blockId, args: newArgsAndUiState.args, uiState: newArgsAndUiState.uiState }]);
    } else {
      // resetting staging outputs for all downstream blocks
      this.getStagingGraph().traverse('downstream', [blockId], ({ id }) => this.resetStaging(id));
    }

    // also reset or limbo all downstream productions
    if (info.productionRendered)
      this.getActualProductionGraph().traverse('downstream', [blockId], ({ id }) =>
        this.resetOrLimboProduction(id),
      );

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
      prodGraph.traverse('upstream', blockIds, (node) => {
        blockIdsSet.add(node.id);
      });
    else // checking that targets contain all upstreams
      for (const blockId of blockIdsSet) {
        const node = prodGraph.nodes.get(blockId);
        if (node === undefined) throw new Error(`Can't find block with id: ${blockId}`);
        for (const upstream of node.upstream)
          if (!blockIdsSet.has(upstream))
            throw new Error('Can\'t render blocks not including all upstreams.');
      }

    // traversing in topological order and rendering target blocks
    const rendered = new Set<string>();
    for (const block of allBlocks(this.structure)) {
      if (!blockIdsSet.has(block.id)) continue;

      let render
        = this.getBlockInfo(block.id).requireProductionRendering || this.blocksInLimbo.has(block.id);

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

    const renderedArray = [...rendered];

    // sending to limbo all downstream blocks
    prodGraph.traverse('downstream', renderedArray, (node) => {
      if (rendered.has(node.id))
        // don't send to limbo blocks that were just rendered
        return;
      this.resetOrLimboProduction(node.id);
    });

    // resetting staging outputs for all downstream blocks
    this.getStagingGraph().traverse('downstream', renderedArray, ({ id }) => {
      // don't reset staging of the first rendered block
      if (renderedArray[0] !== id) this.resetStaging(id);
    });

    if (rendered.size > 0) this.updateLastModified();

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

      if (this.deleteBlockFields(blockId, 'prodOutput', 'prodCtx', 'prodUiCtx', 'prodArgs')) {
        // was actually stopped
        stopped.push(blockId);

        // will try to stop all its downstreams
        for (const downstream of activeProdGraph.traverseIdsExcludingRoots('downstream', blockId)) {
          if (queued.has(downstream)) continue;
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
    stagingGraph.nodes.forEach((node) => {
      const info = this.getBlockInfo(node.id);
      let lag = info.stagingRendered ? 0 : 1;
      node.upstream.forEach((upstream) => {
        const upstreamLag = lags.get(upstream)!;
        if (upstreamLag === 0) return;
        lag = Math.max(upstreamLag + 1, lag);
      });
      cb(node.id, lag);
      lags.set(node.id, lag);
    });
  }

  /** @param stagingRenderingRate rate in blocks per second */
  private refreshStagings(stagingRenderingRate?: number) {
    const elapsed = Date.now() - this.renderingState.stagingRefreshTimestamp;
    const lagThreshold
      = stagingRenderingRate === undefined
        ? undefined
        : 1 + Math.max(0, (elapsed * stagingRenderingRate) / 1000);
    let rendered = 0;
    this.traverseWithStagingLag((blockId, lag) => {
      if (lag === 0)
        // meaning staging already rendered
        return;
      if (lagThreshold === undefined || lag <= lagThreshold) {
        this.renderStagingFor(blockId);
        rendered++;
      }
    });
    if (rendered > 0) this.resetStagingRefreshTimestamp();
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
    this.blockInfos.forEach((blockInfo) => {
      if (
        blockInfo.fields.prodCtx?.status === 'Ready'
        && blockInfo.fields.prodOutput?.status === 'Ready'
      )
        this.deleteBlockFields(
          blockInfo.id,
          'prodOutputPrevious',
          'prodCtxPrevious',
          'prodUiCtxPrevious',
        );
      if (
        blockInfo.fields.stagingCtx?.status === 'Ready'
        && blockInfo.fields.stagingOutput?.status === 'Ready'
      )
        this.deleteBlockFields(
          blockInfo.id,
          'stagingOutputPrevious',
          'stagingCtxPrevious',
          'stagingUiCtxPrevious',
        );
    });
  }

  private assignAuthorMarkers() {
    const markerStr = this.author ? JSON.stringify(this.author) : undefined;

    for (const blockId of this.blocksWithChangedInputs)
      if (markerStr === undefined) this.tx.deleteKValue(this.rid, blockArgsAuthorKey(blockId));
      else this.tx.setKValue(this.rid, blockArgsAuthorKey(blockId), markerStr);

    if (this.metaChanged || this.structureChanged) {
      if (markerStr === undefined) this.tx.deleteKValue(this.rid, ProjectStructureAuthorKey);
      else this.tx.setKValue(this.rid, ProjectStructureAuthorKey, markerStr);
    }
  }

  public save() {
    if (!this.wasModified) return;

    if (this.lastModifiedChanged)
      this.tx.setKValue(this.rid, ProjectLastModifiedTimestamp, JSON.stringify(this.lastModified));

    if (this.structureChanged)
      this.tx.setKValue(this.rid, ProjectStructureKey, JSON.stringify(this.struct));

    if (this.renderingStateChanged)
      this.tx.setKValue(
        this.rid,
        BlockRenderingStateKey,
        JSON.stringify({
          ...this.renderingState,
          blocksInLimbo: [...this.blocksInLimbo],
        } as ProjectRenderingState),
      );

    if (this.metaChanged) this.tx.setKValue(this.rid, ProjectMetaKey, JSON.stringify(this.meta));

    this.assignAuthorMarkers();
  }

  public static async load(
    projectHelper: ProjectHelper,
    tx: PlTransaction,
    rid: ResourceId,
    author?: AuthorMarker,
  ): Promise<ProjectMutator> {
    //
    // Sending initial requests to read project state (start of round-trip #1)
    //

    const fullResourceStateP = tx.getResourceData(rid, true);
    const schemaP = tx.getKValueJson<string>(rid, SchemaVersionKey);
    const lastModifiedP = tx.getKValueJson<number>(rid, ProjectLastModifiedTimestamp);
    const metaP = tx.getKValueJson<ProjectMeta>(rid, ProjectMetaKey);
    const structureP = tx.getKValueJson<ProjectStructure>(rid, ProjectStructureKey);
    const renderingStateP = tx.getKValueJson<ProjectRenderingState>(rid, BlockRenderingStateKey);

    const fullResourceState = await fullResourceStateP;

    // loading field information
    const blockInfoStates = new Map<string, BlockInfoState>();
    for (const f of fullResourceState.fields) {
      const projectField = parseProjectField(f.name);

      // processing only fields with known structure
      if (projectField === undefined) continue;

      let info = blockInfoStates.get(projectField.blockId);
      if (info === undefined) {
        info = {
          id: projectField.blockId,
          fields: {},
        };
        blockInfoStates.set(projectField.blockId, info);
      }

      info.fields[projectField.fieldName] = isNullResourceId(f.value)
        ? { modCount: 0 }
        : { modCount: 0, ref: f.value };
    }

    //
    // Roundtrip #1 not yet finished, but as soon as field list is received,
    // we can start sending requests to read states of referenced resources
    // (start of round-trip #2)
    //

    const blockFieldRequests: [BlockInfoState, ProjectField['fieldName'], BlockFieldState, Promise<BasicResourceData | ResourceData>][] = [];
    blockInfoStates.forEach((info) => {
      const fields = info.fields;
      for (const [fName, state] of Object.entries(fields)) {
        if (state.ref === undefined) continue;
        if (!isResource(state.ref) || isResourceRef(state.ref))
          throw new Error('unexpected behaviour');
        const fieldName = fName as ProjectField['fieldName'];
        blockFieldRequests.push([
          info, fieldName,
          state, tx.getResourceData(state.ref, fieldName == 'blockPack')]);
      }
    });

    // loading jsons
    const [
      schema,
      lastModified,
      meta,
      structure,
      { stagingRefreshTimestamp, blocksInLimbo },
    ] = await Promise.all([
      schemaP,
      lastModifiedP,
      metaP,
      structureP,
      renderingStateP,
    ]);

    // Checking schema version of the project
    if (schema !== SchemaVersionCurrent) {
      if (Number(schema) < Number(SchemaVersionCurrent))
        throw new UiError(`Can't perform this action on this project because it has older schema. Try (re)loading the project to update it.`);
      else
        throw new UiError(`Can't perform this action on this project because it has newer schema. Upgrade your desktop app to the latest version.`);
    }

    //
    // <- at this point we have all the responses from round-trip #1
    //

    //
    // Receiving responses from round-trip #2 and sending requests to read block pack descriptions
    // (start of round-trip #3)
    //

    const blockPackRequests: [BlockInfoState, Promise<BasicResourceData>][] = [];
    for (const [info, fieldName, state, response] of blockFieldRequests) {
      const result = await response;
      state.value = result.data;
      if (isNotNullResourceId(result.error)) state.status = 'Error';
      else if (result.resourceReady || isNotNullResourceId(result.originalResourceId))
        state.status = 'Ready';
      else state.status = 'NotReady';

      // For block pack we need to traverse the ref field from the resource data
      if (fieldName === 'blockPack') {
        const refField = (result as ResourceData).fields.find((f) => f.name === Pl.HolderRefField);
        if (refField === undefined)
          throw new Error('Block pack ref field is missing');
        blockPackRequests.push([info, tx.getResourceData(ensureResourceIdNotNull(refField.value), false)]);
      }
    }

    //
    // <- at this point we have all the responses from round-trip #2
    //

    for (const [info, response] of blockPackRequests) {
      const result = await response;
      const bpInfo = cachedDeserialize<BlockPackInfo>(notEmpty(result.data));
      info.blockConfig = extractConfig(bpInfo.config);
      info.blockPack = bpInfo.source;
    }

    //
    // <- at this point we have all the responses from round-trip #3
    //

    // loading ctx export template to check if we already have cached materialized template in our project
    const ctxExportTplEnvelope = await getPreparedExportTemplateEnvelope();

    // expected field name
    const ctxExportTplCacheFieldName = getServiceTemplateField(ctxExportTplEnvelope.hash);
    const ctxExportTplField = fullResourceState.fields.find(
      (f) => f.name === ctxExportTplCacheFieldName,
    );
    let ctxExportTplHolder: AnyResourceRef;
    if (ctxExportTplField !== undefined)
      ctxExportTplHolder = ensureResourceIdNotNull(ctxExportTplField.value);
    else {
      ctxExportTplHolder = Pl.wrapInHolder(tx, loadTemplate(tx, ctxExportTplEnvelope.spec));
      tx.createField(
        field(rid, getServiceTemplateField(ctxExportTplEnvelope.hash)),
        'Dynamic',
        ctxExportTplHolder,
      );
    }

    const renderingState = { stagingRefreshTimestamp };
    const blocksInLimboSet = new Set(blocksInLimbo);

    const blockInfos = new Map<string, BlockInfo>();
    blockInfoStates.forEach(({ id, fields, blockConfig, blockPack }) => blockInfos.set(id,
      new BlockInfo(id, fields, notEmpty(blockConfig), notEmpty(blockPack))));

    // check consistency of project state
    const blockInStruct = new Set<string>();
    for (const b of allBlocks(structure)) {
      if (!blockInfos.has(b.id))
        throw new Error(`Inconsistent project structure: no inputs for ${b.id}`);
      blockInStruct.add(b.id);
    }
    blockInfos.forEach((info) => {
      if (!blockInStruct.has(info.id))
        throw new Error(`Inconsistent project structure: no structure entry for ${info.id}`);
      // checking structure
      info.check();
    });

    const prj = new ProjectMutator(
      rid,
      tx,
      author,
      schema,
      lastModified,
      meta,
      structure,
      renderingState,
      blocksInLimboSet,
      blockInfos,
      ctxExportTplHolder,
      projectHelper,
    );

    prj.fixProblemsAndMigrate();

    return prj;
  }
}

export interface ProjectState {
  schema: string;
  structure: ProjectStructure;
  renderingState: Omit<ProjectRenderingState, 'blocksInLimbo'>;
  blocksInLimbo: Set<string>;
  blockInfos: Map<string, BlockInfo>;
}

export async function createProject(
  tx: PlTransaction,
  meta: ProjectMeta = InitialBlockMeta,
): Promise<AnyResourceRef> {
  const prj = tx.createEphemeral(ProjectResourceType);
  tx.lock(prj);
  const ts = String(Date.now());
  tx.setKValue(prj, SchemaVersionKey, JSON.stringify(SchemaVersionCurrent));
  tx.setKValue(prj, ProjectCreatedTimestamp, ts);
  tx.setKValue(prj, ProjectLastModifiedTimestamp, ts);
  tx.setKValue(prj, ProjectMetaKey, JSON.stringify(meta));
  tx.setKValue(prj, ProjectStructureKey, JSON.stringify(InitialBlockStructure));
  tx.setKValue(prj, BlockRenderingStateKey, JSON.stringify(InitialProjectRenderingState));
  const ctxExportTplEnvelope = await getPreparedExportTemplateEnvelope();
  tx.createField(
    field(prj, getServiceTemplateField(ctxExportTplEnvelope.hash)),
    'Dynamic',
    Pl.wrapInHolder(tx, loadTemplate(tx, ctxExportTplEnvelope.spec)),
  );
  return prj;
}

export async function withProject<T>(
  projectHelper: ProjectHelper,
  txOrPl: PlTransaction | PlClient,
  rid: ResourceId,
  cb: (p: ProjectMutator) => T | Promise<T>,
): Promise<T> {
  return withProjectAuthored(projectHelper, txOrPl, rid, undefined, cb);
}

export async function withProjectAuthored<T>(
  projectHelper: ProjectHelper,
  txOrPl: PlTransaction | PlClient,
  rid: ResourceId,
  author: AuthorMarker | undefined,
  cb: (p: ProjectMutator) => T | Promise<T>,
): Promise<T> {
  if (txOrPl instanceof PlClient) {
    return await txOrPl.withWriteTx('ProjectAction', async (tx) => {
      const mut = await ProjectMutator.load(projectHelper, tx, rid, author);
      const result = await cb(mut);
      if (!mut.wasModified)
        // skipping save and commit altogether if no modifications were actually made
        return result;
      mut.save();
      await tx.commit();
      if (getDebugFlags().logProjectMutationStat) console.log(JSON.stringify(tx.stat));
      return result;
    });
  } else {
    const mut = await ProjectMutator.load(projectHelper, txOrPl, rid, author);
    const result = await cb(mut);
    mut.save();
    return result;
  }
}
