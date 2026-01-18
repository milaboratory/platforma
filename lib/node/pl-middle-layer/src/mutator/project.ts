import type {
  AnyRef,
  AnyResourceRef,
  BasicResourceData,
  PlTransaction,
  ResourceData,
  ResourceId,
  TxOps,
} from '@milaboratories/pl-client';
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
import { cachedDeserialize, notEmpty, canonicalJsonBytes, cachedDecode } from '@milaboratories/ts-helpers';
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

  private readonly blockStorageC = cached(
    () => this.fields.blockStorage!.modCount,
    () => {
      const bin = this.fields.blockStorage?.value;
      if (bin === undefined) return undefined;
      return cachedDeserialize<Record<string, unknown>>(bin);
    },
  );

  private readonly blockStorageJ = cached(
    () => this.fields.blockStorage!.modCount,
    () => {
      const bin = this.fields.blockStorage?.value;
      if (bin === undefined) return undefined;
      return cachedDecode(bin);
    },
  );

  private readonly prodArgsC = cached(
    () => this.fields.prodArgs?.modCount,
    () => {
      const bin = this.fields.prodArgs?.value;
      if (bin === undefined) return undefined;
      return cachedDeserialize(bin);
    },
  );

  private readonly currentPreRunArgsC = cached(
    () => this.fields.currentPreRunArgs?.modCount,
    () => {
      const bin = this.fields.currentPreRunArgs?.value;
      if (bin === undefined) return undefined;
      return cachedDeserialize(bin);
    },
  );

  private readonly stagingPreRunArgsC = cached(
    () => this.fields.stagingPreRunArgs?.modCount,
    () => {
      const bin = this.fields.stagingPreRunArgs?.value;
      if (bin === undefined) return undefined;
      return cachedDeserialize(bin);
    },
  );

  get currentArgs(): unknown {
    return this.currentArgsC();
  }

  get blockStorage(): unknown {
    try {
      return this.blockStorageC();
    } catch (e) {
      console.error('Error getting blockStorage:', e);
      return undefined;
    }
  }

  get blockStorageJson() {
    return this.blockStorageJ();
  }

  get currentPreRunArgs(): unknown {
    return this.currentPreRunArgsC();
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

  /** Returns true if currentPreRunArgs differs from stagingPreRunArgs (or if stagingPreRunArgs is not set) */
  private readonly preRunStaleC: () => boolean = cached(
    () => `${this.fields.currentPreRunArgs?.modCount}_${this.fields.stagingPreRunArgs?.modCount}`,
    () => {
      if (this.fields.currentPreRunArgs === undefined) return false; // No preRunArgs means no staging needed
      if (this.fields.stagingPreRunArgs === undefined) return true; // Never ran staging with current preRunArgs
      return Buffer.compare(this.fields.currentPreRunArgs.value!, this.fields.stagingPreRunArgs.value!) !== 0;
    },
  );

  get requireProductionRendering(): boolean {
    return !this.productionRendered || this.productionStaleC() || this.productionHasErrors;
  }

  /** Returns true if staging should be re-rendered (currentPreRunArgs differs from stagingPreRunArgs) */
  get requireStagingRendering(): boolean {
    // No staging needed if currentPreRunArgs is undefined (args derivation failed)
    if (this.fields.currentPreRunArgs === undefined) return false;
    return !this.stagingRendered || this.preRunStaleC();
  }

  get prodArgs(): unknown {
    return this.prodArgsC();
  }

  get stagingPreRunArgs(): unknown {
    return this.stagingPreRunArgsC();
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
  state: string;
}

const NoNewBlocks = (blockId: string) => {
  throw new Error(`No new block info for ${blockId}`);
};

/**
 * Request to set block state using unified state format.
 * For v3 blocks: state is the block's state
 * For v1/v2 blocks: state should be { args, uiState } format
 */
export interface SetStatesRequest {
  blockId: string;
  /** The unified state to set */
  state: unknown;
}

export type ClearState = {
  state: unknown;
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
    if (content === undefined) throw new Error('content is undefined');
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

  /**
   * Gets current block state and merges with partial updates.
   * Used by legacy v1/v2 methods like setBlockArgs and setUiState.
   *
   * @param blockId The block to get state for
   * @param partialUpdate Partial state to merge (e.g. { args } or { uiState })
   * @returns Merged state in unified format { args, uiState }
   */
  public mergeBlockState(
    blockId: string,
    partialUpdate: { args?: unknown; uiState?: unknown },
  ): { args?: unknown; uiState?: unknown } {
    const info = this.getBlockInfo(blockId);
    const currentState = info.blockStorage as { args?: unknown; uiState?: unknown } | undefined;
    return { ...currentState, ...partialUpdate };
  }

  /**
   * Sets raw block storage content directly (for testing purposes).
   * This bypasses all normalization and VM transformations.
   *
   * @param blockId The block to set storage for
   * @param rawStorageJson Raw storage as JSON string
   */
  public setBlockStorageRaw(blockId: string, rawStorageJson: string): void {
    this.setBlockFieldObj(blockId, 'blockStorage', this.createJsonFieldValueByContent(rawStorageJson));
    this.blocksWithChangedInputs.add(blockId);
    this.updateLastModified();
  }

  /** Optimally sets inputs for multiple blocks in one go */
  public setStates(requests: SetStatesRequest[]) {
    const changedArgs: string[] = [];
    let somethingChanged = false;
    for (const req of requests) {
      const info = this.getBlockInfo(req.blockId);
      let blockChanged = false;

      const blockConfig = info.config;
      // modelAPIVersion === 2 means BlockModelV3 with .args() lambda for deriving args
      const usesArgsDeriv = blockConfig.modelAPIVersion === 2;

      if (usesArgsDeriv) {
        const currentStorageJson = info.blockStorageJson;

        const updatedStorageJson = this.projectHelper.applyStorageUpdateInVM(
          blockConfig,
          currentStorageJson,
          req.state,
        );

        this.setBlockFieldObj(req.blockId, 'blockStorage', this.createJsonFieldValueByContent(updatedStorageJson));
      } else {
        this.setBlockFieldObj(req.blockId, 'blockStorage', this.createJsonFieldValue(req.state));
      }

      // Derive args from state using the block's config.args() callback
      let args: unknown;
      let preRunArgs: unknown;
      let argsValid = true; // Track whether args derivation succeeded

      if (usesArgsDeriv) {
        const derivedArgsResult = this.projectHelper.deriveArgsFromState(blockConfig, req.state);
        if (derivedArgsResult.error) {
          args = {};
          preRunArgs = undefined;
          argsValid = false;
        } else {
          const derivedArgs = derivedArgsResult.value;
          args = derivedArgs;
          argsValid = true;

          // Derive preRunArgs using preRunArgs() callback, or fall back to args
          preRunArgs = this.projectHelper.derivePreRunArgsFromState(blockConfig, req.state);
        }
      } else {
        if (req.state !== null && typeof req.state === 'object' && 'args' in req.state) {
          args = (req.state as { args: unknown }).args;
        } else {
          args = req.state;
        }
        // For v1 blocks, preRunArgs = args (same as production args)
        preRunArgs = args;
      }

      const currentArgsData = canonicalJsonBytes(args);
      const argsPartRef = this.tx.createValue(Pl.JsonObject, currentArgsData);
      this.setBlockField(req.blockId, 'currentArgs', argsPartRef, 'Ready', currentArgsData);

      // Set currentPreRunArgs field and check if it actually changed
      let preRunArgsChanged = false;
      if (preRunArgs !== undefined) {
        const preRunArgsData = canonicalJsonBytes(preRunArgs);
        const oldPreRunArgsData = info.fields.currentPreRunArgs?.value;
        // Check if preRunArgs actually changed
        if (oldPreRunArgsData === undefined || Buffer.compare(oldPreRunArgsData, preRunArgsData) !== 0) {
          preRunArgsChanged = true;
        }
        const preRunArgsRef = this.tx.createValue(Pl.JsonObject, preRunArgsData);
        this.setBlockField(req.blockId, 'currentPreRunArgs', preRunArgsRef, 'Ready', preRunArgsData);
      } else {
        // preRunArgs is undefined - check if we previously had one
        if (info.fields.currentPreRunArgs !== undefined) {
          preRunArgsChanged = true;
        }
      }

      // Set inputsValid field only for Model API v2 (with args derivation)
      // For Model API v1, don't set this field so project_overview uses the argsValid callback
      if (usesArgsDeriv) {
        const inputsValidData = canonicalJsonBytes(argsValid);
        const inputsValidRef = this.tx.createValue(Pl.JsonBool, inputsValidData);
        this.setBlockField(req.blockId, 'inputsValid', inputsValidRef, 'Ready', inputsValidData);
      }

      blockChanged = true;
      // Only add to changedArgs if preRunArgs changed - this controls staging reset
      if (preRunArgsChanged) {
        changedArgs.push(req.blockId);
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

  /**
   * Renders staging for a block using currentPreRunArgs.
   * If currentPreRunArgs is not set (preRunArgs returned undefined), skips staging for this block.
   */
  private renderStagingFor(blockId: string) {
    this.resetStaging(blockId);

    const info = this.getBlockInfo(blockId);

    // If currentPreRunArgs is not set (preRunArgs returned undefined), skip staging for this block
    const preRunArgsRef = info.fields.currentPreRunArgs?.ref;
    if (preRunArgsRef === undefined) {
      return;
    }

    const ctx = this.createStagingCtx(this.getStagingGraph().nodes.get(blockId)!.upstream);

    if (this.getBlock(blockId).renderingMode !== 'Heavy') throw new Error('not supported yet');

    const tpl = info.getTemplate(this.tx);

    // Use currentPreRunArgs for staging rendering
    const results = createRenderHeavyBlock(this.tx, tpl, {
      args: preRunArgsRef,
      blockId: this.tx.createValue(Pl.JsonString, JSON.stringify(blockId)),
      isProduction: this.tx.createValue(Pl.JsonBool, JSON.stringify(false)),
      context: ctx,
    });

    // Here we set the staging ctx to the input context of the staging workflow, not the output because exports
    // of one staging context should stay within the same block, and not travel downstream.
    // We may change this decision in the future if wanted to support traveling staging exports downstream.
    this.setBlockField(
      blockId,
      'stagingCtx',
      Pl.wrapInEphHolder(this.tx, ctx),
      'NotReady',
    );

    // Yet the staging UI Ctx is the output context of the staging workflow, because it is used to form the result pool
    // thus creating a certain discrepancy between staging workflow context behavior and desktop's result pool.
    this.setBlockField(blockId, 'stagingUiCtx', this.exportCtx(results.context), 'NotReady');
    this.setBlockField(blockId, 'stagingOutput', results.result, 'NotReady');

    // Save stagingPreRunArgs to track which preRunArgs were used for this staging render
    this.setBlockFieldObj(blockId, 'stagingPreRunArgs', info.fields.currentPreRunArgs!);
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

    // Derive args from initialState using config.args() callback
    // If args derivation fails (throws), inputsValid is set to false;

    // Parse the initial state
    const initialState = spec.state ? JSON.parse(spec.state) : {};

    const blockConfig = info.config;
    // modelAPIVersion === 2 means BlockModelV3 with .args() lambda for deriving args
    const usesArgsDeriv = blockConfig.modelAPIVersion === 2;

    let inputsValid = true;
    let args: unknown;
    let preRunArgs: unknown;

    if (usesArgsDeriv && blockConfig !== undefined) {
      // Model API v2+: derive args from state using the args() callback
      const deriveArgsResult = this.projectHelper.deriveArgsFromState(blockConfig, initialState);
      if (deriveArgsResult.error) {
        // Args derivation failed (threw exception) - block is not ready
        args = {};
        preRunArgs = undefined;
        inputsValid = false;
      } else {
        args = deriveArgsResult.value;
        inputsValid = true;
        // Derive preRunArgs using preRunArgs() callback, or fall back to args
        preRunArgs = this.projectHelper.derivePreRunArgsFromState(blockConfig, initialState);
      }
    } else if (blockConfig.modelAPIVersion === 1) {
      // Model API v1: use spec.args directly
      args = JSON.parse(spec.state).args;
      if (args === undefined) {
        throw new Error('args is undefined in the state for config version 3');
      }
      preRunArgs = args; // For v1 blocks, preRunArgs = args
    } else {
      throw new Error('Unknown model API version');
    }

    // currentArgs
    this.setBlockFieldObj(blockId, 'currentArgs', this.createJsonFieldValue(args));

    // currentPreRunArgs
    if (preRunArgs !== undefined) {
      this.setBlockFieldObj(blockId, 'currentPreRunArgs', this.createJsonFieldValue(preRunArgs));
    }

    // inputsValid - only set for Model API v2+ (with args derivation)
    // For Model API v1, don't set this field so project_overview uses the argsValid callback
    if (usesArgsDeriv) {
      const inputsValidData = canonicalJsonBytes(inputsValid);
      const inputsValidRef = this.tx.createValue(Pl.JsonBool, inputsValidData);
      this.setBlockField(blockId, 'inputsValid', inputsValidRef, 'Ready', inputsValidData);
    }

    // blockStorage - use VM-based storage for V3+ blocks to write in BlockStorage format
    let storageToWrite = spec.state ?? '{}';
    if (usesArgsDeriv && blockConfig !== undefined) {
      // Apply initial state via VM to create proper BlockStorage format
      const updatedStorageJson = this.projectHelper.applyStorageUpdateInVM(
        blockConfig,
        undefined, // No current storage for new block
        initialState,
      );
      if (updatedStorageJson !== undefined) {
        storageToWrite = updatedStorageJson;
      }
    }
    this.setBlockFieldObj(blockId, 'blockStorage', this.createJsonFieldValueByContent(storageToWrite));

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

  public migrateBlockPack(blockId: string, spec: BlockPackSpecPrepared, newClearState?: ClearState): void {
    const info = this.getBlockInfo(blockId);
    const newConfig = extractConfig(spec.config);

    this.setBlockField(
      blockId,
      'blockPack',
      Pl.wrapInHolder(this.tx, createBlockPack(this.tx, spec)),
      'NotReady',
    );

    if (newClearState !== undefined) {
      // State is being reset - no migration needed
      this.setStates([{ blockId, state: newClearState.state }]);
    } else {
      // State is being preserved - run migrations if needed via VM
      // Only Model API v2 blocks support migrations
      const supportsStateMigrations = newConfig.modelAPIVersion === 2;

      if (supportsStateMigrations) {
        const currentStorageJson = info.blockStorageJson;

        const migrationResult = this.projectHelper.migrateStorageInVM(newConfig, currentStorageJson);

        if (migrationResult.error) {
          console.error(`[migrateBlockPack] Migration error for block ${blockId}:`, migrationResult.error);
          // On migration failure, keep the old state (don't crash)
          // The block may be in an inconsistent state but at least we don't lose data
          // TODO v3
        } else if (migrationResult.migrated && migrationResult.newStorageJson) {
          this.setBlockStorageRaw(blockId, migrationResult.newStorageJson);
        }
      }

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

    // blocks under stopped blocks, but having finished production results, goes to limbo
    for (const blockId of activeProdGraph.traverseIdsExcludingRoots('downstream', ...stopped))
      this.resetOrLimboProduction(blockId);

    // reset staging outputs for all downstream blocks
    this.getStagingGraph().traverse('downstream', stopped, ({ id }) => this.resetStaging(id));
  }

  private traverseWithStagingLag(cb: (blockId: string, lag: number) => void) {
    const lags = new Map<string, number>();
    const stagingGraph = this.getStagingGraph();
    stagingGraph.nodes.forEach((node) => {
      const info = this.getBlockInfo(node.id);
      // Use requireStagingRendering to check both: staging exists AND preRunArgs hasn't changed
      const requiresRendering = info.requireStagingRendering;
      let lag = requiresRendering ? 1 : 0;
      node.upstream.forEach((upstream) => {
        const upstreamLag = lags.get(upstream)!;
        if (upstreamLag === 0) return;
        lag = Math.max(upstreamLag + 1, lag);
      });
      if (!requiresRendering && info.stagingRendered) {
        // console.log(`[traverseWithStagingLag] SKIP staging for ${node.id} - preRunArgs unchanged`);
      }
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
        // console.log(`[refreshStagings] RENDER staging for ${blockId} (lag=${lag})`);
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
  ops?: Partial<TxOps>,
): Promise<T> {
  return withProjectAuthored(projectHelper, txOrPl, rid, undefined, cb, ops);
}

export async function withProjectAuthored<T>(
  projectHelper: ProjectHelper,
  txOrPl: PlTransaction | PlClient,
  rid: ResourceId,
  author: AuthorMarker | undefined,
  cb: (p: ProjectMutator) => T | Promise<T>,
  ops: Partial<TxOps> = {},
): Promise<T> {
  if (txOrPl instanceof PlClient) {
    return await txOrPl.withWriteTx('ProjectAction' + (ops.name ? `: ${ops.name}` : ''), async (tx) => {
      const mut = await ProjectMutator.load(projectHelper, tx, rid, author);
      const result = await cb(mut);
      if (!mut.wasModified)
        // skipping save and commit altogether if no modifications were actually made
        return result;
      mut.save();
      await tx.commit();
      if (getDebugFlags().logProjectMutationStat) console.log(JSON.stringify(tx.stat));
      return result;
    }, ops);
  } else {
    const mut = await ProjectMutator.load(projectHelper, txOrPl, rid, author);
    const result = await cb(mut);
    mut.save();
    return result;
  }
}
