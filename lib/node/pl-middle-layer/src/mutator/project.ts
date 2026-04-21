import type {
  AnyRef,
  AnyResourceRef,
  BasicResourceData,
  PlTransaction,
  ResourceData,
  ResourceId,
  TxOps,
} from "@milaboratories/pl-client";
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
} from "@milaboratories/pl-client";
import {
  createRenderHeavyBlock,
  createBContextFromUpstreams,
  createBContextEnd,
} from "./template/render_block";
import type {
  Block,
  ProjectStructure,
  ProjectField,
  ProjectRenderingState,
} from "../model/project_model";
import {
  BlockRenderingStateKey,
  ProjectStructureKey,
  parseProjectField,
  projectFieldName,
  SchemaVersionCurrent,
  SchemaVersionKey,
  SchemaVersionV3,
  ProjectResourceType,
  InitialBlockStructure,
  InitialProjectRenderingState,
  ProjectMetaKey,
  InitialBlockMeta,
  blockArgsAuthorKey,
  BlockArgsAuthorKeyPrefix,
  ProjectLastModifiedTimestamp,
  ProjectCreatedTimestamp,
  ProjectStructureAuthorKey,
  getServiceTemplateField,
  FieldsToDuplicate,
} from "../model/project_model";
import { ModelAPIVersionMismatchError } from "@milaboratories/pl-errors";
import { BlockPackTemplateField, createBlockPack } from "./block-pack/block_pack";
import type { BlockGraph, ProductionGraphBlockInfo } from "../model/project_model_util";
import { allBlocks, graphDiff, productionGraph, stagingGraph } from "../model/project_model_util";
import type { BlockPackSpecPrepared } from "../model";
import type {
  AuthorMarker,
  BlockPackSpec,
  BlockSettings,
  ProjectMeta,
} from "@milaboratories/pl-model-middle-layer";
import { InitialBlockSettings } from "@milaboratories/pl-model-middle-layer";
import Denque from "denque";
import { exportContext, getPreparedExportTemplateEnvelope } from "./context_export";
import { loadTemplate } from "./template/template_loading";
import {
  cachedDeserialize,
  notEmpty,
  canonicalJsonBytes,
  cachedDecode,
  type MiLogger,
  ConsoleLoggerAdapter,
} from "@milaboratories/ts-helpers";
import { gzipSync } from "node:zlib";
import type { ProjectHelper } from "../model/project_helper";
import {
  extractConfig,
  UiError,
  BLOCK_STORAGE_FACADE_VERSION,
  type BlockConfig,
} from "@platforma-sdk/model";
import { getDebugFlags } from "../debug";
import type { BlockPackInfo } from "../model/block_pack";

type FieldStatus = "NotReady" | "Ready" | "Error";

interface BlockFieldState {
  modCount: number;
  ref?: AnyRef;
  status?: FieldStatus;
  value?: Uint8Array;
}

type BlockFieldStates = Partial<Record<ProjectField["fieldName"], BlockFieldState>>;
type BlockFieldStateValue = Omit<BlockFieldState, "modCount">;

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
    return value!;
  };
}

class BlockInfo {
  constructor(
    public readonly id: string,
    public readonly fields: BlockFieldStates,
    public readonly config: BlockConfig,
    public readonly source: BlockPackSpec,
    private readonly logger: MiLogger = new ConsoleLoggerAdapter(),
  ) {}

  public check() {
    // state assertions

    if ((this.fields.prodOutput === undefined) !== (this.fields.prodCtx === undefined))
      throw new Error("inconsistent prod fields");
    if ((this.fields.prodOutput === undefined) !== (this.fields.prodUiCtx === undefined))
      throw new Error("inconsistent prod fields (prodUiCtx)");

    if ((this.fields.stagingOutput === undefined) !== (this.fields.stagingCtx === undefined))
      throw new Error("inconsistent stage fields");
    if ((this.fields.stagingOutput === undefined) !== (this.fields.stagingUiCtx === undefined))
      throw new Error("inconsistent stage fields (stagingUiCtx)");

    if (
      (this.fields.prodOutputPrevious === undefined) !==
      (this.fields.prodCtxPrevious === undefined)
    )
      throw new Error("inconsistent prod cache fields");
    if (
      (this.fields.prodOutputPrevious === undefined) !==
      (this.fields.prodUiCtxPrevious === undefined)
    )
      throw new Error("inconsistent prod cache fields (prodUiCtxPrevious)");

    if (
      (this.fields.stagingOutputPrevious === undefined) !==
      (this.fields.stagingCtxPrevious === undefined)
    )
      throw new Error("inconsistent stage cache fields");
    if (
      (this.fields.stagingOutputPrevious === undefined) !==
      (this.fields.stagingUiCtxPrevious === undefined)
    )
      throw new Error("inconsistent stage cache fields (stagingUiCtxPrevious)");

    if (this.fields.blockPack === undefined) throw new Error("no block pack field");

    if (this.fields.blockStorage === undefined) throw new Error("no block storage field");
  }

  private readonly currentArgsC = cached(
    () => this.fields.currentArgs?.modCount,
    () => {
      const bin = this.fields.currentArgs?.value;
      if (bin === undefined) return undefined;
      return cachedDeserialize(bin);
    },
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

  private readonly currentPrerunArgsC = cached(
    () => this.fields.currentPrerunArgs?.modCount,
    () => {
      const bin = this.fields.currentPrerunArgs?.value;
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
      this.logger.error(new Error(`Error getting blockStorage for ${this.id}`, { cause: e }));
      return undefined;
    }
  }

  get blockStorageJson() {
    return this.blockStorageJ();
  }

  get currentPrerunArgs(): unknown {
    return this.currentPrerunArgsC();
  }

  get stagingRendered(): boolean {
    return this.fields.stagingCtx !== undefined;
  }

  get productionRendered(): boolean {
    return this.fields.prodCtx !== undefined;
  }

  get productionHasErrors(): boolean {
    return (
      this.fields.prodUiCtx?.status === "Error" ||
      this.fields.prodOutput?.status === "Error" ||
      this.fields.prodCtx?.status === "Error"
    );
  }

  private readonly productionStaleC: () => boolean = cached(
    () => `${this.fields.currentArgs!.modCount}_${this.fields.prodArgs?.modCount}`,
    () =>
      this.fields.prodArgs === undefined ||
      Buffer.compare(this.fields.currentArgs!.value!, this.fields.prodArgs.value!) !== 0,
  );

  get requireProductionRendering(): boolean {
    return !this.productionRendered || this.productionStaleC() || this.productionHasErrors;
  }

  /** Returns true if staging should be re-rendered (stagingCtx is not set) */
  get requireStagingRendering(): boolean {
    // No staging needed if currentPrerunArgs is undefined (args derivation failed)
    if (this.fields.currentPrerunArgs === undefined) return false;
    return !this.stagingRendered;
  }

  get prodArgs(): unknown {
    return this.prodArgsC();
  }

  public getTemplate(tx: PlTransaction): AnyRef {
    return tx.getFutureFieldValue(
      Pl.unwrapHolder(tx, this.fields.blockPack!.ref!),
      BlockPackTemplateField,
      "Input",
    );
  }
}

/**
 * Specification for creating a new block.
 * Discriminated union based on `storageMode`.
 */
/** Specification for creating a new block. Discriminated union based on `storageMode`. */
export type NewBlockSpec =
  | { storageMode: "fromModel"; blockPack: BlockPackSpecPrepared }
  | { storageMode: "legacy"; blockPack: BlockPackSpecPrepared; legacyState: string };

const NoNewBlocks = (blockId: string) => {
  throw new Error(`No new block info for ${blockId}`);
};

/**
 * Request to set block state using unified state format.
 * For v3 blocks: state is the block's state
 * For v1/v2 blocks: state should be { args, uiState } format
 */
export type SetStatesRequest =
  | {
      blockId: string;
      /** The unified state to set */
      state: unknown;
      modelAPIVersion: 1;
    }
  | {
      blockId: string;
      /** Storage operation payload - middle layer is agnostic to specific operations */
      payload: { operation: string; value: unknown };
      modelAPIVersion: 2;
    };

export type ClearState = {
  state: unknown;
};

export class ProjectMutator {
  /** Max number of blocks to render staging for in a single background refresh pass. */
  private static readonly STAGING_REFRESH_MAX_BATCH = 10;

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
    private readonly renderingState: Omit<ProjectRenderingState, "blocksInLimbo">,
    private readonly blocksInLimbo: Set<string>,
    private readonly blockInfos: Map<string, BlockInfo>,
    private readonly ctxExportTplHolder: AnyResourceRef,
    private readonly projectHelper: ProjectHelper,
  ) {}

  private fixProblemsAndMigrate() {
    // Fix inconsistent production fields.
    // All four fields (prodArgs, prodOutput, prodCtx, prodUiCtx) must be present together.
    // prodUiCtx can be missing after project duplication: prodCtx uses a holder wrapper
    // (always non-null), but prodUiCtx is a raw FieldRef that may still be NullResourceId
    // at snapshot time and thus not copied.
    this.blockInfos.forEach((blockInfo) => {
      if (
        blockInfo.fields.prodArgs === undefined ||
        blockInfo.fields.prodOutput === undefined ||
        blockInfo.fields.prodCtx === undefined ||
        blockInfo.fields.prodUiCtx === undefined
      )
        this.deleteBlockFields(blockInfo.id, "prodArgs", "prodOutput", "prodCtx", "prodUiCtx");
    });

    // Fix inconsistent staging fields (same FieldRef issue for stagingUiCtx)
    this.blockInfos.forEach((blockInfo) => {
      if (
        blockInfo.fields.stagingOutput === undefined ||
        blockInfo.fields.stagingCtx === undefined ||
        blockInfo.fields.stagingUiCtx === undefined
      )
        this.deleteBlockFields(blockInfo.id, "stagingOutput", "stagingCtx", "stagingUiCtx");
    });

    // Fix inconsistent cache fields
    this.blockInfos.forEach((blockInfo) => {
      if (
        blockInfo.fields.prodOutputPrevious === undefined ||
        blockInfo.fields.prodCtxPrevious === undefined ||
        blockInfo.fields.prodUiCtxPrevious === undefined
      )
        this.deleteBlockFields(
          blockInfo.id,
          "prodOutputPrevious",
          "prodCtxPrevious",
          "prodUiCtxPrevious",
        );
      if (
        blockInfo.fields.stagingOutputPrevious === undefined ||
        blockInfo.fields.stagingCtxPrevious === undefined ||
        blockInfo.fields.stagingUiCtxPrevious === undefined
      )
        this.deleteBlockFields(
          blockInfo.id,
          "stagingOutputPrevious",
          "stagingCtxPrevious",
          "stagingUiCtxPrevious",
        );
    });

    // Migration for addition of block settings field
    let initialBlockSettings: Omit<BlockFieldState, "modCount"> | undefined;
    this.blockInfos.forEach((blockInfo) => {
      if (blockInfo.fields.blockSettings === undefined) {
        if (initialBlockSettings === undefined)
          initialBlockSettings = this.createJsonFieldValue(InitialBlockSettings);
        this.setBlockFieldObj(blockInfo.id, "blockSettings", initialBlockSettings);
      }
    });

    // Migration: build production context chain if not present,
    // and reset all stagings so they re-render using the new chain
    const needsChainBuild = [...this.blockInfos.values()].some(
      (info) => info.fields.prodChainCtx === undefined,
    );
    if (needsChainBuild && this.blockInfos.size > 0) {
      this.rebuildProdChain(0);
      this.blockInfos.forEach((blockInfo) => {
        this.resetStaging(blockInfo.id);
      });
    }

    // Validate after fixes
    this.blockInfos.forEach((info) => info.check());
  }

  get wasModified(): boolean {
    return (
      this.lastModifiedChanged ||
      this.structureChanged ||
      this.fieldsChanged ||
      this.metaChanged ||
      this.renderingStateChanged
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

  private getProductionGraphBlockInfo(
    blockId: string,
    prod: boolean,
  ): ProductionGraphBlockInfo | undefined {
    const bInfo = this.getBlockInfo(blockId);

    let argsField: BlockFieldState | undefined;
    let args: unknown;

    if (prod) {
      if (bInfo.fields.prodArgs === undefined) return undefined;
      argsField = bInfo.fields.prodArgs;
      args = bInfo.prodArgs;
    } else {
      argsField = bInfo.fields.currentArgs;
      args = bInfo.currentArgs;
    }

    // Can't compute enrichment targets without args
    if (argsField === undefined) {
      return { args, enrichmentTargets: undefined };
    }

    const blockPackField = notEmpty(bInfo.fields.blockPack);

    if (isResourceId(argsField.ref!) && isResourceId(blockPackField.ref!))
      return {
        args,
        enrichmentTargets: this.projectHelper.getEnrichmentTargets(
          () => bInfo.config,
          () => args,
          { argsRid: argsField.ref, blockPackRid: blockPackField.ref },
        ),
      };
    else
      return {
        args,
        enrichmentTargets: this.projectHelper.getEnrichmentTargets(
          () => bInfo.config,
          () => args,
        ),
      };
  }

  private getPendingProductionGraph(): BlockGraph {
    if (this.pendingProductionGraph === undefined)
      this.pendingProductionGraph = productionGraph(this.struct, (blockId) =>
        this.getProductionGraphBlockInfo(blockId, false),
      );
    return this.pendingProductionGraph;
  }

  private getActualProductionGraph(): BlockGraph {
    if (this.actualProductionGraph === undefined)
      this.actualProductionGraph = productionGraph(this.struct, (blockId) =>
        this.getProductionGraphBlockInfo(blockId, true),
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

  /** Create a plain JSON resource value from a JS object (no compression). */
  private createJsonFieldValue(obj: unknown): BlockFieldStateValue {
    const value = Buffer.from(JSON.stringify(obj));
    const ref = this.tx.createValue(Pl.JsonObject, value);
    return { ref, value, status: "Ready" };
  }

  /** Create a plain JSON resource value from a pre-serialized JSON string (no compression). */
  private createJsonFieldValueFromContent(json: string): BlockFieldStateValue {
    const value = Buffer.from(json);
    const ref = this.tx.createValue(Pl.JsonObject, value);
    return { ref, value, status: "Ready" };
  }

  /** Create a gzip-compressed JSON resource value from a JS object (compressed if >= 16KB). */
  private createGzJsonFieldValue(obj: unknown): BlockFieldStateValue {
    const jsonBytes = canonicalJsonBytes(obj);
    return this.createGzJsonFieldValueFromBytes(jsonBytes);
  }

  /** Create a gzip-compressed JSON resource value from a pre-serialized JSON string (compressed if >= 16KB). */
  private createGzJsonFieldValueFromContent(json: string): BlockFieldStateValue {
    return this.createGzJsonFieldValueFromBytes(Buffer.from(json));
  }

  private createGzJsonFieldValueFromBytes(jsonBytes: Uint8Array): BlockFieldStateValue {
    const gzipThreshold = 16_384;
    if (jsonBytes.length >= gzipThreshold) {
      const data = gzipSync(jsonBytes);
      const ref = this.tx.createValue(Pl.JsonGzObject, data);
      return { ref, value: data, status: "Ready" };
    }
    const ref = this.tx.createValue(Pl.JsonObject, jsonBytes);
    return { ref, value: jsonBytes, status: "Ready" };
  }

  private getBlock(blockId: string): Block {
    for (const block of allBlocks(this.struct)) if (block.id === blockId) return block;
    throw new Error("block not found");
  }

  private setBlockFieldObj(
    blockId: string,
    fieldName: keyof BlockFieldStates,
    state: BlockFieldStateValue,
  ) {
    const fid = field(this.rid, projectFieldName(blockId, fieldName));

    if (state.ref === undefined) throw new Error("Can't set value with empty ref");

    if (this.getBlockInfo(blockId).fields[fieldName] === undefined)
      this.tx.createField(fid, "Dynamic", state.ref);
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
    const outputDone =
      fields.stagingOutput?.status === "Ready" || fields.stagingOutput?.status === "Error";
    const ctxDone = fields.stagingCtx?.status === "Ready" || fields.stagingCtx?.status === "Error";
    const uiCtxDone =
      fields.stagingUiCtx?.status === "Ready" || fields.stagingUiCtx?.status === "Error";
    if (outputDone && ctxDone && uiCtxDone) {
      this.setBlockFieldObj(blockId, "stagingOutputPrevious", fields.stagingOutput!);
      this.setBlockFieldObj(blockId, "stagingCtxPrevious", fields.stagingCtx!);
      this.setBlockFieldObj(blockId, "stagingUiCtxPrevious", fields.stagingUiCtx!);
    }
    if (this.deleteBlockFields(blockId, "stagingOutput", "stagingCtx", "stagingUiCtx"))
      this.resetStagingRefreshTimestamp();
  }

  private resetProduction(blockId: string): void {
    const fields = this.getBlockInfo(blockId).fields;
    const outputDone =
      fields.prodOutput?.status === "Ready" || fields.prodOutput?.status === "Error";
    const ctxDone = fields.prodCtx?.status === "Ready" || fields.prodCtx?.status === "Error";
    const uiCtxDone = fields.prodUiCtx?.status === "Ready" || fields.prodUiCtx?.status === "Error";
    if (outputDone && ctxDone && uiCtxDone) {
      this.setBlockFieldObj(blockId, "prodOutputPrevious", fields.prodOutput!);
      this.setBlockFieldObj(blockId, "prodCtxPrevious", fields.prodCtx!);
      this.setBlockFieldObj(blockId, "prodUiCtxPrevious", fields.prodUiCtx!);
    }
    this.deleteBlockFields(blockId, "prodOutput", "prodCtx", "prodUiCtx", "prodArgs");
  }

  /** Running blocks are reset, already computed moved to limbo. Returns if
   * either of the actions were actually performed.
   * This method ensures the block is left in a consistent state that passes check() constraints. */
  private resetOrLimboProduction(blockId: string): boolean {
    const fields = this.getBlockInfo(blockId).fields;

    // Check if we can safely move to limbo (both core production fields are ready)
    if (fields.prodOutput?.status === "Ready" && fields.prodCtx?.status === "Ready") {
      if (this.blocksInLimbo.has(blockId))
        // we are already in limbo
        return false;

      // limbo - keep the ready production results but clean up cache
      this.blocksInLimbo.add(blockId);
      this.renderingStateChanged = true;

      // doing some gc - clean up previous cache fields
      this.deleteBlockFields(blockId, "prodOutputPrevious", "prodCtxPrevious", "prodUiCtxPrevious");

      return true;
    } else {
      // reset - clean up any partial/inconsistent production stat
      return this.deleteBlockFields(
        blockId,
        "prodOutput",
        "prodCtx",
        "prodUiCtx",
        "prodArgs",
        "prodOutputPrevious",
        "prodCtxPrevious",
        "prodUiCtxPrevious",
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
    if (currentState === undefined) {
      throw new Error(`Cannot merge block state for ${blockId}: blockStorage is unavailable`);
    }
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
    this.setBlockFieldObj(
      blockId,
      "blockStorage",
      this.createGzJsonFieldValueFromContent(rawStorageJson),
    );
    this.blocksWithChangedInputs.add(blockId);
    this.updateLastModified();
  }

  /**
   * Resets a v2+ block to its initial storage state.
   * Gets initial storage from VM and derives args from it.
   *
   * For v1 blocks, use setStates() instead.
   *
   * @param blockId The block to reset
   */
  public resetToInitialStorage(blockId: string): void {
    const info = this.getBlockInfo(blockId);
    const blockConfig = info.config;

    if (blockConfig.modelAPIVersion !== BLOCK_STORAGE_FACADE_VERSION) {
      throw new Error("resetToInitialStorage is only supported for model API version 2");
    }

    // Get initial storage from VM
    const initialStorageJson = this.projectHelper.getInitialStorageInVM(blockConfig);
    this.setBlockStorageRaw(blockId, initialStorageJson);

    // Derive prerunArgs first — always derived independently of args validation
    const prerunArgs = this.projectHelper.derivePrerunArgsFromStorage(
      blockConfig,
      initialStorageJson,
    );
    if (prerunArgs !== undefined) {
      this.setBlockFieldObj(blockId, "currentPrerunArgs", this.createJsonFieldValue(prerunArgs));
    } else {
      this.deleteBlockFields(blockId, "currentPrerunArgs");
    }

    // Derive args from storage - set or clear currentArgs based on derivation result
    const deriveArgsResult = this.projectHelper.deriveArgsFromStorage(
      blockConfig,
      initialStorageJson,
    );
    if (!deriveArgsResult.error) {
      this.setBlockFieldObj(
        blockId,
        "currentArgs",
        this.createJsonFieldValue(deriveArgsResult.value),
      );
    } else {
      this.deleteBlockFields(blockId, "currentArgs");
    }
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

      if (req.modelAPIVersion !== blockConfig.modelAPIVersion) {
        throw new ModelAPIVersionMismatchError(
          req.blockId,
          req.modelAPIVersion,
          blockConfig.modelAPIVersion,
        );
      }

      // Derive args from storage using the block's config.args() callback
      let args: unknown;
      let prerunArgs: unknown;

      if (req.modelAPIVersion === BLOCK_STORAGE_FACADE_VERSION) {
        const currentStorageJson = info.blockStorageJson;
        if (currentStorageJson === undefined) {
          throw new Error(`Block ${req.blockId} has no blockStorage - this should not happen`);
        }

        // Apply the state update to storage
        const updatedStorageJson = this.projectHelper.applyStorageUpdateInVM(
          blockConfig,
          currentStorageJson,
          req.payload,
        );

        this.setBlockFieldObj(
          req.blockId,
          "blockStorage",
          this.createGzJsonFieldValueFromContent(updatedStorageJson),
        );

        // Derive prerunArgs first — always derived independently of args validation
        prerunArgs = this.projectHelper.derivePrerunArgsFromStorage(
          blockConfig,
          updatedStorageJson,
        );

        // Derive args from storage (VM extracts data internally)
        const derivedArgsResult = this.projectHelper.deriveArgsFromStorage(
          blockConfig,
          updatedStorageJson,
        );
        args = derivedArgsResult.error ? undefined : derivedArgsResult.value;
      } else {
        this.setBlockFieldObj(req.blockId, "blockStorage", this.createGzJsonFieldValue(req.state));
        if (req.state !== null && typeof req.state === "object" && "args" in req.state) {
          args = (req.state as { args: unknown }).args;
        } else {
          args = req.state;
        }
        // For the legacy blocks, prerunArgs = args (same as production args)
        prerunArgs = args;
      }

      // Set or clear currentArgs based on derivation result
      // NB: currentArgs must NOT be gzipped — they are read by Tengo workflows which can't decompress
      if (args !== undefined) {
        const currentArgsData = canonicalJsonBytes(args);
        const argsPartRef = this.tx.createValue(Pl.JsonObject, currentArgsData);
        this.setBlockField(req.blockId, "currentArgs", argsPartRef, "Ready", currentArgsData);
      } else {
        this.deleteBlockFields(req.blockId, "currentArgs");
      }

      // Set currentPrerunArgs field and check if it actually changed
      // NB: currentPrerunArgs must NOT be gzipped — they are read by Tengo workflows which can't decompress
      let prerunArgsChanged = false;
      if (prerunArgs !== undefined) {
        const prerunArgsData = canonicalJsonBytes(prerunArgs);
        const oldPrerunArgsData = info.fields.currentPrerunArgs?.value;
        // Check if prerunArgs actually changed
        if (
          oldPrerunArgsData === undefined ||
          Buffer.compare(oldPrerunArgsData, prerunArgsData) !== 0
        ) {
          prerunArgsChanged = true;
        }
        const prerunArgsRef = this.tx.createValue(Pl.JsonObject, prerunArgsData);
        this.setBlockField(
          req.blockId,
          "currentPrerunArgs",
          prerunArgsRef,
          "Ready",
          prerunArgsData,
        );
      } else {
        this.deleteBlockFields(req.blockId, "currentPrerunArgs");
      }

      blockChanged = true;
      // Only add to changedArgs if prerunArgs changed - this controls staging reset
      if (prerunArgsChanged) {
        changedArgs.push(req.blockId);
      }

      if (blockChanged) {
        // will be assigned our author marker
        this.blocksWithChangedInputs.add(req.blockId);
        somethingChanged = true;
      }
    }

    // Render staging inline for blocks with changed prerunArgs — no downstream cascade.
    // Each block's staging uses only the pre-built production context chain (prodChainCtx),
    // which doesn't change on arg edits, so downstream blocks are unaffected.
    for (const blockId of changedArgs) {
      try {
        this.renderStagingFor(blockId);
      } catch (e) {
        this.projectHelper.logger.error(
          new Error(`[setStates] inline staging render failed for ${blockId}`, { cause: e }),
        );
      }
    }

    if (somethingChanged) this.updateLastModified();
  }

  public setBlockSettings(blockId: string, newValue: BlockSettings): void {
    this.setBlockFieldObj(blockId, "blockSettings", this.createJsonFieldValue(newValue));
    this.updateLastModified();
  }

  private createProdCtx(upstream: Set<string>): AnyRef {
    const upstreamContexts: AnyRef[] = [];
    upstream.forEach((id) => {
      const info = this.getBlockInfo(id);
      if (info.fields["prodCtx"]?.ref === undefined)
        throw new Error("One of the upstreams staging is not rendered.");
      upstreamContexts.push(Pl.unwrapHolder(this.tx, info.fields["prodCtx"].ref));
    });
    return createBContextFromUpstreams(this.tx, upstreamContexts);
  }

  /**
   * Rebuilds the production context chain from `fromBlockIndex` to the end.
   * Each block gets a `prodChainCtx` field containing the accumulated production
   * contexts from all blocks above it in project order.
   *
   * Construction rule for block at position K:
   * - If block K-1 has prodCtx: chainNode[K] = BContext(chainNode[K-1], K-1.prodCtx)
   * - If block K-1 has no prodCtx: chainNode[K] = chainNode[K-1] (passthrough)
   * - Block 0: chainNode[0] = BContextEnd
   */
  private rebuildProdChain(fromBlockIndex: number = 0): void {
    const blocks = [...allBlocks(this.struct)];
    if (fromBlockIndex >= blocks.length) return;

    // Get the inner chain context ref of the block before fromBlockIndex
    let prevChainCtx: AnyRef | undefined;
    if (fromBlockIndex > 0) {
      const prevHolder = this.getBlockInfo(blocks[fromBlockIndex - 1].id).fields.prodChainCtx?.ref;
      if (prevHolder === undefined) {
        throw new Error(
          `rebuildProdChain(${fromBlockIndex}): block ${blocks[fromBlockIndex - 1].id} at position ${fromBlockIndex - 1} has no prodChainCtx — chain must be built from 0 first`,
        );
      }
      prevChainCtx = Pl.unwrapHolder(this.tx, prevHolder);
    }

    for (let i = fromBlockIndex; i < blocks.length; i++) {
      const blockId = blocks[i].id;

      let newChainCtx: AnyRef;

      if (i === 0) {
        // First block: nothing above
        newChainCtx = createBContextEnd(this.tx);
      } else {
        const prevBlockId = blocks[i - 1].id;
        const prevInfo = this.getBlockInfo(prevBlockId);
        const prevProdCtxHolder = prevInfo.fields.prodCtx?.ref;

        if (prevProdCtxHolder !== undefined) {
          // Block above has production: accumulate into chain
          const upstreams: AnyRef[] = [];
          upstreams.push(prevChainCtx!);
          upstreams.push(Pl.unwrapHolder(this.tx, prevProdCtxHolder));
          newChainCtx = createBContextFromUpstreams(this.tx, upstreams);
        } else {
          // Passthrough: reuse inner context from previous block
          newChainCtx = prevChainCtx!;
        }
      }

      // Store chain node (wrapped in holder)
      this.setBlockField(
        blockId,
        "prodChainCtx",
        Pl.wrapInEphHolder(this.tx, newChainCtx),
        "NotReady",
      );

      prevChainCtx = newChainCtx;
    }
  }

  private exportCtx(ctx: AnyRef): AnyRef {
    return exportContext(this.tx, Pl.unwrapHolder(this.tx, this.ctxExportTplHolder), ctx);
  }

  /**
   * Renders staging for a block using currentPrerunArgs.
   * If currentPrerunArgs is not set (prerunArgs returned undefined), skips staging for this block.
   */
  private renderStagingFor(blockId: string) {
    const info = this.getBlockInfo(blockId);

    // Skip if currentPrerunArgs is not set (prerunArgs() returned undefined or args derivation failed)
    const prerunArgsRef = info.fields.currentPrerunArgs?.ref;
    if (prerunArgsRef === undefined) {
      return;
    }

    this.resetStaging(blockId);

    // Use the pre-built production context chain node
    const chainCtxHolder = info.fields.prodChainCtx?.ref;
    if (chainCtxHolder === undefined) {
      throw new Error(
        `[renderStagingFor] block ${blockId} has no prodChainCtx — chain must be built before staging render`,
      );
    }
    const ctx = Pl.unwrapHolder(this.tx, chainCtxHolder);

    if (this.getBlock(blockId).renderingMode !== "Heavy") throw new Error("not supported yet");

    const tpl = info.getTemplate(this.tx);

    // Use currentPrerunArgs for staging rendering
    const results = createRenderHeavyBlock(this.tx, tpl, {
      args: prerunArgsRef,
      blockId: this.tx.createValue(Pl.JsonString, JSON.stringify(blockId)),
      isProduction: this.tx.createValue(Pl.JsonBool, JSON.stringify(false)),
      context: ctx,
    });

    // Here we set the staging ctx to the input context of the staging workflow, not the output because exports
    // of one staging context should stay within the same block, and not travel downstream.
    // We may change this decision in the future if wanted to support traveling staging exports downstream.
    this.setBlockField(blockId, "stagingCtx", Pl.wrapInEphHolder(this.tx, ctx), "NotReady");

    // Yet the staging UI Ctx is the output context of the staging workflow, because it is used to form the result pool
    // thus creating a certain discrepancy between staging workflow context behavior and desktop's result pool.
    this.setBlockField(blockId, "stagingUiCtx", this.exportCtx(results.context), "NotReady");
    this.setBlockField(blockId, "stagingOutput", results.result, "NotReady");
  }

  private renderProductionFor(blockId: string) {
    this.resetProduction(blockId);

    const info = this.getBlockInfo(blockId);

    // Can't render production if currentArgs is not set
    if (info.fields.currentArgs === undefined) {
      throw new Error(`Can't render production for block ${blockId}: currentArgs not set`);
    }

    const ctx = this.createProdCtx(this.getPendingProductionGraph().nodes.get(blockId)!.upstream);

    if (this.getBlock(blockId).renderingMode === "Light")
      throw new Error("Can't render production for light block.");

    const tpl = info.getTemplate(this.tx);

    const results = createRenderHeavyBlock(this.tx, tpl, {
      args: info.fields.currentArgs.ref!,
      blockId: this.tx.createValue(Pl.JsonString, JSON.stringify(blockId)),
      isProduction: this.tx.createValue(Pl.JsonBool, JSON.stringify(true)),
      context: ctx,
    });
    this.setBlockField(
      blockId,
      "prodCtx",
      Pl.wrapInEphHolder(this.tx, results.context),
      "NotReady",
    );
    this.setBlockField(blockId, "prodUiCtx", this.exportCtx(results.context), "NotReady");
    this.setBlockField(blockId, "prodOutput", results.result, "NotReady");

    // saving inputs for which we rendered the production
    this.setBlockFieldObj(blockId, "prodArgs", info.fields.currentArgs);

    // removing block from limbo as we juts rendered fresh production for it
    if (this.blocksInLimbo.delete(blockId)) this.renderingStateChanged = true;
  }

  //
  // Structure changes
  //

  private initializeNewBlock(blockId: string, spec: NewBlockSpec): void {
    const info = new BlockInfo(
      blockId,
      {},
      extractConfig(spec.blockPack.config),
      spec.blockPack.source,
      this.projectHelper.logger,
    );
    this.blockInfos.set(blockId, info);

    // block pack
    const bp = createBlockPack(this.tx, spec.blockPack);
    this.setBlockField(blockId, "blockPack", Pl.wrapInHolder(this.tx, bp), "NotReady");

    // settings
    this.setBlockFieldObj(
      blockId,
      "blockSettings",
      this.createJsonFieldValue(InitialBlockSettings),
    );

    const blockConfig = info.config;

    let args: unknown;
    let prerunArgs: unknown;
    let storageToWrite: string;

    if (spec.storageMode === "fromModel") {
      // Model API v2+: get initial storage and derive args from it
      storageToWrite = this.projectHelper.getInitialStorageInVM(blockConfig);

      // Derive prerunArgs first — always derived independently of args validation
      prerunArgs = this.projectHelper.derivePrerunArgsFromStorage(blockConfig, storageToWrite);

      // Derive args from storage (VM extracts data internally)
      const deriveArgsResult = this.projectHelper.deriveArgsFromStorage(
        blockConfig,
        storageToWrite,
      );
      args = deriveArgsResult.error ? undefined : deriveArgsResult.value;
    } else if (spec.storageMode === "legacy") {
      // Model API v1: use legacyState from spec
      const parsedState = JSON.parse(spec.legacyState);
      args = parsedState.args;
      if (args === undefined) {
        throw new Error("args is undefined in legacyState");
      }
      prerunArgs = args;
      storageToWrite = spec.legacyState;
    } else {
      throw new Error(`Unknown storageMode: ${(spec as NewBlockSpec).storageMode}`);
    }

    // currentArgs
    if (args !== undefined) {
      this.setBlockFieldObj(blockId, "currentArgs", this.createJsonFieldValue(args));
    }

    // currentPrerunArgs
    if (prerunArgs !== undefined) {
      this.setBlockFieldObj(blockId, "currentPrerunArgs", this.createJsonFieldValue(prerunArgs));
    }

    // blockStorage
    this.setBlockFieldObj(
      blockId,
      "blockStorage",
      this.createGzJsonFieldValueFromContent(storageToWrite),
    );

    // checking structure
    info.check();
  }

  private getFieldNamesToDuplicate(blockId: string): Set<ProjectField["fieldName"]> {
    const fields = this.getBlockInfo(blockId).fields;

    const diff = <T>(setA: Set<T>, setB: Set<T>): Set<T> =>
      new Set([...setA].filter((x) => !setB.has(x)));

    // Check if we can safely move to limbo (both core production fields are ready)
    if (fields.prodOutput?.status === "Ready" && fields.prodCtx?.status === "Ready") {
      if (this.blocksInLimbo.has(blockId))
        // we are already in limbo
        return FieldsToDuplicate;

      return diff(
        FieldsToDuplicate,
        new Set(["prodOutputPrevious", "prodCtxPrevious", "prodUiCtxPrevious"]),
      );
    } else {
      return diff(
        FieldsToDuplicate,
        new Set([
          "prodOutput",
          "prodCtx",
          "prodUiCtx",
          "prodArgs",
          "prodOutputPrevious",
          "prodCtxPrevious",
          "prodUiCtxPrevious",
        ]),
      );
    }
  }

  private initializeBlockDuplicate(blockId: string, originalBlockInfo: BlockInfo) {
    const info = new BlockInfo(
      blockId,
      {},
      originalBlockInfo.config,
      originalBlockInfo.source,
      this.projectHelper.logger,
    );

    this.blockInfos.set(blockId, info);

    const fieldNamesToDuplicate = this.getFieldNamesToDuplicate(blockId);

    // Copy all fields from original block to new block by sharing references
    for (const [fieldName, fieldState] of Object.entries(originalBlockInfo.fields)) {
      if (
        fieldNamesToDuplicate.has(fieldName as ProjectField["fieldName"]) &&
        fieldState &&
        fieldState.ref
      ) {
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
      this.deleteBlockFields(blockId, ...(Object.keys(fields) as ProjectField["fieldName"][]));
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
    const newActualProductionGraph = productionGraph(newStructure, (blockId) =>
      this.getProductionGraphBlockInfo(blockId, true),
    );

    const prodDiff = graphDiff(currentActualProductionGraph, newActualProductionGraph);

    // applying changes due to topology change in production to affected nodes and
    // all their downstreams
    currentActualProductionGraph.traverse("downstream", [...prodDiff.different], (node) => {
      this.resetOrLimboProduction(node.id);
    });

    if (
      stagingDiff.onlyInB.size > 0 ||
      stagingDiff.onlyInA.size > 0 ||
      stagingDiff.different.size > 0
    )
      this.resetStagingRefreshTimestamp();

    this.struct = newStructure;
    this.structureChanged = true;
    this.stagingGraph = undefined;
    this.pendingProductionGraph = undefined;
    this.actualProductionGraph = undefined;

    // Rebuild production chain — structure (and thus block order) may have changed.
    // Find the first position that changed to avoid rebuilding the entire chain.
    const newBlocks = [...allBlocks(newStructure)];
    const oldBlocks = [...currentStagingGraph.nodes.keys()];
    const n = Math.min(newBlocks.length, oldBlocks.length);
    let firstChangedIdx = 0;
    while (firstChangedIdx < n && newBlocks[firstChangedIdx].id === oldBlocks[firstChangedIdx]) {
      firstChangedIdx++;
    }
    if (firstChangedIdx < newBlocks.length) {
      this.rebuildProdChain(firstChangedIdx);
    }

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
      if (blockId !== block.id) throw new Error("Unexpected");
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
      if (blockId !== newBlockId) throw new Error("Unexpected");
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

  public migrateBlockPack(
    blockId: string,
    spec: BlockPackSpecPrepared,
    newClearState?: ClearState,
  ): void {
    const info = this.getBlockInfo(blockId);
    const newConfig = extractConfig(spec.config);

    const persistBlockPack = () => {
      this.setBlockField(
        blockId,
        "blockPack",
        Pl.wrapInHolder(this.tx, createBlockPack(this.tx, spec)),
        "NotReady",
      );
    };

    const applyStorageAndDeriveArgs = (storageJson: string) => {
      persistBlockPack();
      this.setBlockStorageRaw(blockId, storageJson);

      // Derive prerunArgs first — always derived independently of args validation
      const prerunArgs = this.projectHelper.derivePrerunArgsFromStorage(newConfig, storageJson);
      if (prerunArgs !== undefined) {
        this.setBlockFieldObj(blockId, "currentPrerunArgs", this.createJsonFieldValue(prerunArgs));
      } else {
        this.deleteBlockFields(blockId, "currentPrerunArgs");
      }

      const deriveArgsResult = this.projectHelper.deriveArgsFromStorage(newConfig, storageJson);
      if (!deriveArgsResult.error) {
        this.setBlockFieldObj(
          blockId,
          "currentArgs",
          this.createJsonFieldValue(deriveArgsResult.value),
        );
      } else {
        this.deleteBlockFields(blockId, "currentArgs");
      }
    };

    if (newClearState !== undefined) {
      // State is being reset - no migration needed
      const supportsStorageFromVM = newConfig.modelAPIVersion === BLOCK_STORAGE_FACADE_VERSION;

      if (supportsStorageFromVM) {
        // V2+: Get initial storage directly from VM and derive args from it
        const initialStorageJson = this.projectHelper.getInitialStorageInVM(newConfig);
        applyStorageAndDeriveArgs(initialStorageJson);
        this.blocksWithChangedInputs.add(blockId);
        this.updateLastModified();
      } else {
        // V1: Use setStates with legacy state format
        persistBlockPack();
        this.setStates([{ modelAPIVersion: 1, blockId, state: newClearState.state }]);
      }
    } else {
      // State is being preserved - run migrations if needed via VM
      // Only Model API v2 blocks support migrations
      const supportsStateMigrations = newConfig.modelAPIVersion === BLOCK_STORAGE_FACADE_VERSION;

      if (supportsStateMigrations) {
        const currentStorageJson = info.blockStorageJson;

        // Attempt migration BEFORE persisting block pack — on failure,
        // block stays on old version (no inconsistent new-code/old-storage state)
        const migrationResult = this.projectHelper.migrateStorageInVM(
          newConfig,
          currentStorageJson,
        );

        if (migrationResult.error !== undefined) {
          throw new Error(
            `[migrateBlockPack] Block ${blockId} migration failed: ${migrationResult.error}`,
          );
        }

        this.projectHelper.logger.info(
          `[migrateBlockPack] Block ${blockId}: ${migrationResult.info}`,
        );
        applyStorageAndDeriveArgs(migrationResult.newStorageJson);
      } else {
        // Legacy blocks (modelAPIVersion 1): persist block pack, set prerunArgs = currentArgs
        persistBlockPack();
        if (info.fields.currentArgs !== undefined) {
          this.setBlockFieldObj(blockId, "currentPrerunArgs", info.fields.currentArgs);
        }
      }

      this.blocksWithChangedInputs.add(blockId);
    }

    // also reset or limbo all downstream productions
    if (info.productionRendered)
      this.getActualProductionGraph().traverse("downstream", [blockId], ({ id }) =>
        this.resetOrLimboProduction(id),
      );

    // Rebuild chain from this block onward (production may have been reset/limboed)
    // and reset staging for the migrated block + everything below
    const blocksList = [...allBlocks(this.struct)];
    const blockIdx = blocksList.findIndex((b) => b.id === blockId);
    if (blockIdx >= 0) {
      this.rebuildProdChain(blockIdx + 1);
      for (let i = blockIdx; i < blocksList.length; i++) {
        this.resetStaging(blocksList[i].id);
      }
    }

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
      prodGraph.traverse("upstream", blockIds, (node) => {
        blockIdsSet.add(node.id);
      });
    else
      // checking that targets contain all upstreams
      for (const blockId of blockIdsSet) {
        const node = prodGraph.nodes.get(blockId);
        if (node === undefined) throw new Error(`Can't find block with id: ${blockId}`);
        for (const upstream of node.upstream)
          if (!blockIdsSet.has(upstream))
            throw new Error("Can't render blocks not including all upstreams.");
      }

    // traversing in topological order and rendering target blocks
    const rendered = new Set<string>();
    for (const block of allBlocks(this.structure)) {
      if (!blockIdsSet.has(block.id)) continue;

      let render =
        this.getBlockInfo(block.id).requireProductionRendering || this.blocksInLimbo.has(block.id);

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
    prodGraph.traverse("downstream", renderedArray, (node) => {
      if (rendered.has(node.id))
        // don't send to limbo blocks that were just rendered
        return;
      this.resetOrLimboProduction(node.id);
    });

    // Rebuild production chain and reset downstream staging
    if (rendered.size > 0) {
      const blocksList = [...allBlocks(this.struct)];
      const firstRenderedIdx = blocksList.findIndex((b) => rendered.has(b.id));
      if (firstRenderedIdx >= 0) {
        // Chain from firstRenderedIdx+1 onward changes (rendered blocks have new prodCtx)
        this.rebuildProdChain(firstRenderedIdx + 1);
        // Reset staging for all blocks after the first rendered block
        // (their chain node changed; the first rendered block's chain is unaffected)
        for (let i = firstRenderedIdx + 1; i < blocksList.length; i++) {
          this.resetStaging(blocksList[i].id);
        }
      }
    }

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

      if (fields.prodOutput?.status === "Ready" && fields.prodCtx?.status === "Ready")
        // skipping finished blocks
        continue;

      if (this.deleteBlockFields(blockId, "prodOutput", "prodCtx", "prodUiCtx", "prodArgs")) {
        // was actually stopped
        stopped.push(blockId);

        // will try to stop all its downstreams
        for (const downstream of activeProdGraph.traverseIdsExcludingRoots("downstream", blockId)) {
          if (queued.has(downstream)) continue;
          queue.push(downstream);
          queued.add(downstream);
        }
      }
    }

    // blocks under stopped blocks, but having finished production results, goes to limbo
    for (const blockId of activeProdGraph.traverseIdsExcludingRoots("downstream", ...stopped))
      this.resetOrLimboProduction(blockId);

    // Rebuild chain and reset staging for stopped blocks and everything below
    if (stopped.length > 0) {
      const blocksList = [...allBlocks(this.struct)];
      const stoppedSet = new Set(stopped);
      const firstStoppedIdx = blocksList.findIndex((b) => stoppedSet.has(b.id));
      if (firstStoppedIdx >= 0) {
        // Stopped blocks lost prodCtx — chain below them changes
        this.rebuildProdChain(firstStoppedIdx + 1);
        for (let i = firstStoppedIdx; i < blocksList.length; i++) {
          this.resetStaging(blocksList[i].id);
        }
      }
    }
  }

  /** Renders staging for blocks that need it (have currentPrerunArgs but no staging). */
  private refreshStagings() {
    const maxBatch = ProjectMutator.STAGING_REFRESH_MAX_BATCH;
    let rendered = 0;
    for (const block of allBlocks(this.struct)) {
      if (rendered >= maxBatch) break;
      const info = this.getBlockInfo(block.id);
      if (info.requireStagingRendering) {
        try {
          this.renderStagingFor(block.id);
          rendered++;
        } catch (e) {
          this.projectHelper.logger.error(
            new Error(`[refreshStagings] renderStagingFor failed for ${block.id}`, { cause: e }),
          );
        }
      }
    }
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

  /** Background maintenance: render pending stagings + GC of Previous fields. */
  public doRefresh() {
    this.refreshStagings();
    this.blockInfos.forEach((blockInfo) => {
      if (
        blockInfo.fields.prodCtx?.status === "Ready" &&
        blockInfo.fields.prodOutput?.status === "Ready"
      )
        this.deleteBlockFields(
          blockInfo.id,
          "prodOutputPrevious",
          "prodCtxPrevious",
          "prodUiCtxPrevious",
        );
      if (
        blockInfo.fields.stagingCtx?.status === "Ready" &&
        blockInfo.fields.stagingOutput?.status === "Ready"
      )
        this.deleteBlockFields(
          blockInfo.id,
          "stagingOutputPrevious",
          "stagingCtxPrevious",
          "stagingUiCtxPrevious",
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

    const blockFieldRequests: [
      BlockInfoState,
      ProjectField["fieldName"],
      BlockFieldState,
      Promise<BasicResourceData | ResourceData>,
    ][] = [];
    blockInfoStates.forEach((info) => {
      const fields = info.fields;
      for (const [fName, state] of Object.entries(fields)) {
        if (state.ref === undefined) continue;
        if (!isResource(state.ref) || isResourceRef(state.ref))
          throw new Error("unexpected behaviour");
        const fieldName = fName as ProjectField["fieldName"];
        blockFieldRequests.push([
          info,
          fieldName,
          state,
          tx.getResourceData(state.ref, fieldName == "blockPack"),
        ]);
      }
    });

    // loading jsons
    const [schema, lastModified, meta, structure, { stagingRefreshTimestamp, blocksInLimbo }] =
      await Promise.all([schemaP, lastModifiedP, metaP, structureP, renderingStateP]);

    // Checking schema version of the project
    if (schema !== SchemaVersionCurrent) {
      if (Number(schema) < Number(SchemaVersionCurrent))
        throw new UiError(
          `Can't perform this action on this project because it has older schema. Try (re)loading the project to update it.`,
        );
      else
        throw new UiError(
          `Can't perform this action on this project because it has newer schema. Upgrade your desktop app to the latest version.`,
        );
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
      if (isNotNullResourceId(result.error)) state.status = "Error";
      else if (result.resourceReady || isNotNullResourceId(result.originalResourceId))
        state.status = "Ready";
      else state.status = "NotReady";

      // For block pack we need to traverse the ref field from the resource data
      if (fieldName === "blockPack") {
        const refField = (result as ResourceData).fields.find((f) => f.name === Pl.HolderRefField);
        if (refField === undefined) throw new Error("Block pack ref field is missing");
        blockPackRequests.push([
          info,
          tx.getResourceData(ensureResourceIdNotNull(refField.value), false),
        ]);
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
        "Dynamic",
        ctxExportTplHolder,
      );
    }

    const renderingState = { stagingRefreshTimestamp };
    const blocksInLimboSet = new Set(blocksInLimbo);

    const blockInfos = new Map<string, BlockInfo>();
    blockInfoStates.forEach(({ id, fields, blockConfig, blockPack }) =>
      blockInfos.set(
        id,
        new BlockInfo(id, fields, notEmpty(blockConfig), notEmpty(blockPack), projectHelper.logger),
      ),
    );

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
  renderingState: Omit<ProjectRenderingState, "blocksInLimbo">;
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
    "Dynamic",
    Pl.wrapInHolder(tx, loadTemplate(tx, ctxExportTplEnvelope.spec)),
  );
  return prj;
}

/**
 * Duplicates an existing project resource within a transaction.
 * Creates a new project resource with all dynamic fields (block data) copied by reference
 * and all KV metadata copied with appropriate adjustments.
 *
 * The returned resource is NOT attached to any project list — the caller is responsible
 * for placing it where needed. This enables cross-user duplication.
 *
 * @param tx - active write transaction
 * @param sourceRid - resource id of the project to duplicate
 * @param options.label - optional label override for the new project; if omitted, copies the source label
 */
export async function duplicateProject(
  tx: PlTransaction,
  sourceRid: ResourceId,
  options?: { label?: string },
): Promise<AnyResourceRef> {
  // Read source resource data (with fields) and all KV pairs
  const sourceDataP = tx.getResourceData(sourceRid, true);
  const sourceKVsP = tx.listKeyValuesString(sourceRid);

  const sourceData = await sourceDataP;
  const sourceKVs = await sourceKVsP;

  // Validate schema version (accept current and previous version that can be migrated on open)
  const schemaKV = sourceKVs.find((kv) => kv.key === SchemaVersionKey);
  const schema = schemaKV ? JSON.parse(schemaKV.value) : undefined;
  if (schema !== SchemaVersionCurrent && schema !== SchemaVersionV3) {
    throw new UiError(
      `Cannot duplicate project with schema version ${schema ?? "unknown"}. ` +
        `Only schema versions ${SchemaVersionV3} and ${SchemaVersionCurrent} are supported. ` +
        `Try opening the project first to trigger migration.`,
    );
  }

  // Create new project resource
  const newPrj = tx.createEphemeral(ProjectResourceType);
  tx.lock(newPrj);

  // Copy KV pairs with adjustments
  const ts = String(Date.now());
  const kvSkipPrefixes = [BlockArgsAuthorKeyPrefix];
  const kvSkipKeys = new Set([
    ProjectCreatedTimestamp,
    ProjectLastModifiedTimestamp,
    ProjectStructureAuthorKey,
  ]);

  for (const { key, value } of sourceKVs) {
    // Skip author markers
    if (kvSkipKeys.has(key)) continue;
    if (kvSkipPrefixes.some((prefix) => key.startsWith(prefix))) continue;

    if (key === ProjectMetaKey && options?.label !== undefined) {
      // Override label
      const meta: ProjectMeta = JSON.parse(value);
      tx.setKValue(newPrj, key, JSON.stringify({ ...meta, label: options.label }));
    } else {
      // Copy as-is
      tx.setKValue(newPrj, key, value);
    }
  }

  // Set fresh timestamps
  tx.setKValue(newPrj, ProjectCreatedTimestamp, ts);
  tx.setKValue(newPrj, ProjectLastModifiedTimestamp, ts);

  // Copy only persistent block fields (FieldsToDuplicate).
  // Transient fields (prodChainCtx, staging*, *Previous) are rebuilt on project open
  // by fixProblemsAndMigrate(). Copying them is both unnecessary and dangerous:
  // some fields use raw FieldRefs (not holder-wrapped) whose values may be NullResourceId
  // at snapshot time, leading to partially copied field groups and broken project state.
  for (const f of sourceData.fields) {
    if (isNullResourceId(f.value)) continue;
    const parsed = parseProjectField(f.name);
    if (parsed !== undefined && !FieldsToDuplicate.has(parsed.fieldName)) continue;
    tx.createField(field(newPrj, f.name), "Dynamic", f.value);
  }

  return newPrj;
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
    return await txOrPl.withWriteTx(
      "ProjectAction" + (ops.name ? `: ${ops.name}` : ""),
      async (tx) => {
        const mut = await ProjectMutator.load(projectHelper, tx, rid, author);
        const result = await cb(mut);
        if (!mut.wasModified)
          // skipping save and commit altogether if no modifications were actually made
          return result;
        mut.save();
        await tx.commit();
        if (getDebugFlags().logProjectMutationStat) console.log(JSON.stringify(tx.stat));
        return result;
      },
      ops,
    );
  } else {
    const mut = await ProjectMutator.load(projectHelper, txOrPl, rid, author);
    const result = await cb(mut);
    mut.save();
    return result;
  }
}
