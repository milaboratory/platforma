import type {
  AnyRef,
  AnyResourceRef,
  BasicResourceData,
  ResourceRef,
  PlTransaction,
  ResourceData,
  SignedResourceId,
  TxOps,
} from "@milaboratories/pl-client";
import {
  ensureSignedResourceIdNotNull,
  field,
  isNotNullSignedResourceId,
  isNullSignedResourceId,
  isResource,
  isResourceId,
  isResourceRef,
  Pl,
  PlClient,
  readyOrDuplicateOrError,
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
  FieldsUnknownToOlderRuntimes,
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
import { InitialBlockSettings, normalizeProjectMeta } from "@milaboratories/pl-model-middle-layer";
import type { ArgsIssue } from "@milaboratories/pl-model-common";
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
  type BlockKindReference,
} from "@platforma-sdk/model";
import type { ProjectTemplateExportOutcome } from "../model/template_serializer";
import { exportProjectAsTemplateV1 } from "../model/template_serializer";
import type { TemplateParamsResult } from "../model/template_export";
import { getDebugFlags } from "../debug";
import type { BlockPackInfo } from "../model/block_pack";
import {
  ArgsChannelFields,
  modelFingerprint,
  storageFingerprint,
  type ArgsChannel,
  type ArgsIssuesRecord,
  type ArgsIssuesSource,
  type DerivedArgs,
} from "../model/derived_args";

type FieldStatus = "NotReady" | "Ready" | "Error";

/**
 * A production core field is "settled" once its result is immutable — `Ready` or a finished
 * `Error`. `NotReady` (still computing) is the only unsettled status; a missing field is unsettled.
 * Settled production is safe to keep/share; only running production is dropped. The resource-level
 * equivalent is {@link readyOrDuplicateOrError}.
 */
function isProductionFieldSettled(status: FieldStatus | undefined): boolean {
  return status === "Ready" || status === "Error";
}

interface BlockFieldState {
  modCount: number;
  ref?: AnyRef;
  status?: FieldStatus;
  value?: Uint8Array;
  /**
   * True when the project field's own error slot is filled, i.e. the render failed outright
   * and left no value resource behind. Distinct from `status === "Error"`, which describes a
   * value resource that exists but carries an error.
   */
  fieldError?: boolean;
}

/** Either failure shape a production field can be in: no value resource, or an errored one. */
function hasError(state: BlockFieldState | undefined): boolean {
  return state?.fieldError === true || state?.status === "Error";
}

/** Args a legacy (model API v1) block state holds: its `args` field, or the whole state when it has none. */
function legacyStateArgs(state: unknown): unknown {
  if (state !== null && typeof state === "object" && "args" in state) return state.args;
  return state;
}

type BlockFieldStates = Partial<Record<ProjectField["fieldName"], BlockFieldState>>;

/**
 * Whether every field a block has is one an older middle layer does not know: what that middle
 * layer leaves when it deletes the block. Such a block has no block pack, so it is no block of
 * the project either way.
 */
function hasOnlyFieldsUnknownToOlderRuntimes(fields: BlockFieldStates): boolean {
  return Object.keys(fields).every((name) => FieldsUnknownToOlderRuntimes.has(name));
}
type BlockFieldStateValue = Omit<BlockFieldState, "modCount">;

interface BlockInfoState {
  readonly id: string;
  readonly fields: BlockFieldStates;
  blockConfig?: BlockConfig;
  /**
   * The block's kind reference, kept separately because `blockConfig` cannot carry
   * it: `extractConfig` normalizes the render envelope and the kind sits at the
   * container level, one level above. Undefined for a block that declares no kind.
   */
  blockKind?: BlockKindReference;
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
    /** See {@link BlockInfoState.blockKind}. */
    public readonly kind: BlockKindReference | undefined,
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

  /**
   * True if the rendered production failed, in either shape {@link hasError} covers.
   *
   * Must stay in step with the `outputError` the desktop derives in
   * `middle_layer/project_overview.ts`, because that flag is what enables the Run button.
   * Any failure counted there but not here leaves Run enabled yet inert: `renderProduction`
   * finds nothing to re-render and commits an empty transaction.
   */
  get productionHasErrors(): boolean {
    return (
      hasError(this.fields.prodUiCtx) ||
      hasError(this.fields.prodOutput) ||
      hasError(this.fields.prodCtx)
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
  | {
      storageMode: "fromModel";
      blockPack: BlockPackSpecPrepared;
      /**
       * Storage to start the block with, instead of the model's own default.
       *
       * Only for a caller that produced it through the block's own model, which today
       * means one seeding a block from a template entry's params: the model's
       * params-to-storage initializer can reject those params, and it has to do so
       * before anything in the transaction changes. Computing the storage first turns
       * that rejection into a value the caller can report, and leaves this method with
       * no failure path it did not already have.
       *
       * The result is the same storage the block would have written itself, so args
       * derivation below is unchanged — which is why this is the `fromModel` mode with
       * one input filled in rather than a mode of its own.
       */
      initialStorage?: string;
    }
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
  /**
   * Values of the project fields this transaction creates, by field name. They are created by
   * {@link save}, so a field created and then deleted within one transaction is never sent: the
   * backend keeps such a field, pointing at a value it has deleted.
   */
  private readonly createdFields = new Map<string, AnyRef>();

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
    public readonly rid: SignedResourceId,
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
    /**
     * Fields of blocks no longer in the project, left behind by a middle layer that does not know
     * them. They are removed with the first change saved: loading alone writes nothing.
     */
    private leftoverFields: readonly string[],
  ) {}

  private fixProblemsAndMigrate() {
    // Fix inconsistent production fields.
    // All four fields (prodArgs, prodOutput, prodCtx, prodUiCtx) must be present together.
    // prodUiCtx can be missing after project duplication: prodCtx uses a holder wrapper
    // (always non-null), but prodUiCtx is a raw FieldRef that may still be NullSignedResourceId
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

    // Fix inconsistent staging fields (same FieldRef issue for stagingUiCtx).
    // stagingArgs goes with the staging it was rendered for, but its absence leaves the staging
    // consistent: projects written before the field existed hold staging without it.
    this.blockInfos.forEach((blockInfo) => {
      if (
        blockInfo.fields.stagingOutput === undefined ||
        blockInfo.fields.stagingCtx === undefined ||
        blockInfo.fields.stagingUiCtx === undefined
      )
        this.deleteBlockFields(
          blockInfo.id,
          "stagingOutput",
          "stagingCtx",
          "stagingUiCtx",
          "stagingArgs",
        );
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

  //
  // Template export
  //

  /**
   * Render this project as a `template-v1` YAML document, or report every reason it
   * cannot be.
   *
   * Read-only: it derives params in the VM and touches no field, so a `withProject`
   * wrapper sees `wasModified === false` and skips the commit.
   *
   * This is where the three providers the serializer needs come from, and all are
   * only reachable here. A block's storage lives behind `BlockInfo`, which is
   * populated by the loader's batched round-trips, and both its kind reference and
   * its origin spec are read off the block-pack container during that same load —
   * `config` cannot carry the kind, since `extractConfig` normalizes the render
   * envelope one level below it, and the spec is not part of the config at all.
   */
  public exportAsTemplateV1(): ProjectTemplateExportOutcome {
    return exportProjectAsTemplateV1(
      this.struct,
      (blockId) => this.deriveTemplateParams(blockId),
      (blockId) => this.blockInfos.get(blockId)?.kind,
      (blockId) => this.blockInfos.get(blockId)?.source,
    );
  }

  private deriveTemplateParams(blockId: string): TemplateParamsResult | undefined {
    const info = this.blockInfos.get(blockId);
    // A block in the structure with no loaded info, or with no storage yet, has no
    // state to project into params. Returning undefined makes the walk report it
    // rather than quietly leaving the block out of the template.
    if (info === undefined) return undefined;

    const storageJson = info.blockStorageJson;
    if (storageJson === undefined) return undefined;

    const derived = this.projectHelper.deriveTemplateParamsFromStorage(info.config, storageJson);
    if (derived.error !== undefined) return { error: derived.error.message };
    return { value: derived.value };
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

  /**
   * Blocks whose production must NOT be shared with a copy of the project: those still computing
   * ("NotReady"), plus their downstream closure. Settled production — `Ready` or a finished
   * `Error` — is kept: it is immutable, so sharing by reference is safe, and sharing an errored
   * project (to show it failed) is a valid use-case. Only running production would tie the copy to
   * the source's live computation.
   *
   * The closure keeps the chain consistent: a finished block's `prodCtx` is built from its
   * upstreams' `prodCtx` (see {@link createProdCtx}), so keeping it while dropping a running
   * upstream would leave it referencing an absent context — a break {@link check} misses. Settled
   * blocks are never seeds, so their downstream is retained.
   *
   * Blocks without production are ignored. Returns empty when nothing is running.
   */
  public productionBlocksToDropForCopy(): Set<string> {
    const dropSet = new Set<string>();
    for (const [blockId, info] of this.blockInfos) {
      const hasProduction =
        info.fields.prodOutput !== undefined || info.fields.prodCtx !== undefined;
      if (!hasProduction) continue;
      // Drop only running production; keep both settled states (Ready and Error).
      const running =
        !isProductionFieldSettled(info.fields.prodOutput?.status) ||
        !isProductionFieldSettled(info.fields.prodCtx?.status);
      if (running) dropSet.add(blockId);
    }
    if (dropSet.size === 0) return dropSet;

    // Snapshot before expanding, so the closure can't re-seed from its own additions. Seed only
    // graph-present blocks: a partial block may lack prodArgs and not be a graph node, and
    // traverse() throws on a missing root.
    const graph = this.getActualProductionGraph();
    const seeds = [...dropSet].filter((id) => graph.nodes.has(id));
    for (const id of graph.traverseIds("downstream", ...seeds)) dropSet.add(id);
    return dropSet;
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
    const name = projectFieldName(blockId, fieldName);

    if (state.ref === undefined) throw new Error("Can't set value with empty ref");

    if (this.getBlockInfo(blockId).fields[fieldName] === undefined || this.createdFields.has(name))
      this.createdFields.set(name, state.ref);
    else this.tx.setField(field(this.rid, name), state.ref);

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
      const name = projectFieldName(blockId, fieldName);
      if (!this.createdFields.delete(name)) this.tx.removeField(field(this.rid, name));
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
    this.deleteBlockFields(blockId, "stagingArgs");
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

  /** Running blocks are reset, settled ones (Ready or finished Error) moved to limbo. Returns if
   * either of the actions were actually performed.
   * This method ensures the block is left in a consistent state that passes check() constraints. */
  private resetOrLimboProduction(blockId: string): boolean {
    const fields = this.getBlockInfo(blockId).fields;

    // Move to limbo only if both core production fields have settled (a finished Error is kept, not
    // reset — sharing/keeping a failed block is valid); otherwise reset.
    if (
      isProductionFieldSettled(fields.prodOutput?.status) &&
      isProductionFieldSettled(fields.prodCtx?.status)
    ) {
      if (this.blocksInLimbo.has(blockId))
        // we are already in limbo
        return false;

      // limbo - keep the settled production results but clean up cache
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
    this.applyDerivedArgs(blockId, blockConfig, initialStorageJson);
  }

  /**
   * Derives the args and the prerun args of a block from `storageJson`, the storage it holds
   * now, and writes the fields of both channels: the ready args, the args validation found
   * errors in, and the issues found.
   *
   * @returns whether the prerun args changed, so the block's staging is to be rendered anew
   */
  private applyDerivedArgs(
    blockId: string,
    blockConfig: BlockConfig,
    storageJson: string,
  ): { prerunChanged: boolean } {
    // Fingerprinting the model hashes its whole code bundle, so it is done only for issues to
    // write, and once for both channels.
    let source: ArgsIssuesSource | undefined;
    const issuesSource = (): ArgsIssuesSource =>
      (source ??= {
        storageHash: storageFingerprint(storageJson),
        modelHash: modelFingerprint(blockConfig),
      });
    this.writeDerivedArgs(
      blockId,
      "args",
      this.projectHelper.deriveArgsFromStorage(blockConfig, storageJson),
      issuesSource,
    );
    const prerunChanged = this.writeDerivedArgs(
      blockId,
      "prerun",
      this.projectHelper.derivePrerunArgsFromStorage(blockConfig, storageJson),
      issuesSource,
    );
    return { prerunChanged };
  }

  /**
   * Writes the fields of one args channel from what the block derived. Ready args are written
   * with their warnings; args with errors are written as the draft, with every issue found; args
   * that are not ready for no reason given, or that the model failed to derive, clear all three
   * fields. A list of issues is never written empty.
   *
   * @returns whether the channel's ready args differ from the ones it had
   */
  private writeDerivedArgs(
    blockId: string,
    channel: ArgsChannel,
    derived: DerivedArgs,
    issuesSource: () => ArgsIssuesSource,
  ): boolean {
    const fields = ArgsChannelFields[channel];
    switch (derived.type) {
      case "ready":
        this.deleteBlockFields(blockId, fields.draft);
        this.writeArgsIssues(blockId, fields.issues, derived.warnings, issuesSource);
        return this.writeArgsValue(blockId, fields.current, derived.value);
      case "blocked":
        this.deleteBlockFields(blockId, fields.current);
        if (derived.draft === undefined) this.deleteBlockFields(blockId, fields.draft);
        else this.writeArgsValue(blockId, fields.draft, derived.draft);
        this.writeArgsIssues(blockId, fields.issues, derived.issues, issuesSource);
        return false;
      case "notReady":
        this.deleteBlockFields(blockId, fields.current, fields.draft, fields.issues);
        return false;
      case "failed":
        this.projectHelper.logger.error(
          new Error(`[applyDerivedArgs] ${channel} derivation failed for ${blockId}`, {
            cause: derived.error,
          }),
        );
        this.deleteBlockFields(blockId, fields.current, fields.draft, fields.issues);
        return false;
    }
  }

  /**
   * Writes the args of a block whose model does not derive them from storage: its prerun runs
   * on the same args, and it reports no issues.
   *
   * @returns whether the prerun args differ from the ones the block had
   */
  private writeLegacyArgs(blockId: string, args: unknown): boolean {
    this.deleteBlockFields(
      blockId,
      "currentDraftArgs",
      "currentArgsIssues",
      "currentDraftPrerunArgs",
      "currentPrerunArgsIssues",
    );
    if (args === undefined) {
      this.deleteBlockFields(blockId, "currentArgs", "currentPrerunArgs");
      return false;
    }
    this.writeArgsValue(blockId, "currentArgs", args);
    return this.writeArgsValue(blockId, "currentPrerunArgs", args);
  }

  /**
   * Writes args to `fieldName`. Args are never gzipped: workflows read them, and cannot
   * decompress.
   *
   * @returns whether the args differ from the ones the field held
   */
  private writeArgsValue(
    blockId: string,
    fieldName: keyof BlockFieldStates,
    args: unknown,
  ): boolean {
    const data = canonicalJsonBytes(args);
    const oldData = this.getBlockInfo(blockId).fields[fieldName]?.value;
    const changed = oldData === undefined || Buffer.compare(oldData, data) !== 0;
    this.setBlockField(blockId, fieldName, this.tx.createValue(Pl.JsonObject, data), "Ready", data);
    return changed;
  }

  private writeArgsIssues(
    blockId: string,
    fieldName: keyof BlockFieldStates,
    issues: ArgsIssue[],
    source: () => ArgsIssuesSource,
  ): void {
    if (issues.length === 0) {
      this.deleteBlockFields(blockId, fieldName);
      return;
    }
    const record: ArgsIssuesRecord = { ...source(), issues };
    this.setBlockFieldObj(blockId, fieldName, this.createJsonFieldValue(record));
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

      // Only a change of prerunArgs resets staging
      let prerunArgsChanged: boolean;

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

        prerunArgsChanged = this.applyDerivedArgs(
          req.blockId,
          blockConfig,
          updatedStorageJson,
        ).prerunChanged;
      } else {
        this.setBlockFieldObj(req.blockId, "blockStorage", this.createGzJsonFieldValue(req.state));
        // For the legacy blocks, prerunArgs = args (same as production args)
        prerunArgsChanged = this.writeLegacyArgs(req.blockId, legacyStateArgs(req.state));
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
    const prerunArgs = info.fields.currentPrerunArgs;
    const prerunArgsRef = prerunArgs?.ref;
    if (prerunArgs === undefined || prerunArgsRef === undefined) {
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

    // Saving prerun args the staging is rendered with
    this.setBlockFieldObj(blockId, "stagingArgs", {
      ref: prerunArgsRef,
      status: prerunArgs.status,
      value: prerunArgs.value,
    });
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
      spec.blockPack.config.kind,
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

    if (spec.storageMode === "fromModel") {
      // Model API v2+: get initial storage and derive args from it. A caller that
      // already produced the storage — a template seeding a block from its params —
      // passes it in, precisely so the VM call that could reject those params happens
      // before the transaction is touched; see `initialStorage`.
      const storage = spec.initialStorage ?? this.projectHelper.getInitialStorageInVM(blockConfig);
      this.setBlockFieldObj(
        blockId,
        "blockStorage",
        this.createGzJsonFieldValueFromContent(storage),
      );
      this.applyDerivedArgs(blockId, blockConfig, storage);
    } else if (spec.storageMode === "legacy") {
      // Model API v1: use legacyState from spec
      const parsedState = JSON.parse(spec.legacyState);
      const args: unknown = parsedState.args;
      if (args === undefined) {
        throw new Error("args is undefined in legacyState");
      }
      this.setBlockFieldObj(
        blockId,
        "blockStorage",
        this.createGzJsonFieldValueFromContent(spec.legacyState),
      );
      this.writeLegacyArgs(blockId, args);
    } else {
      throw new Error(`Unknown storageMode: ${(spec as NewBlockSpec).storageMode}`);
    }

    // checking structure
    info.check();
  }

  private getFieldNamesToDuplicate(blockId: string): Set<ProjectField["fieldName"]> {
    const fields = this.getBlockInfo(blockId).fields;

    const diff = <T>(setA: Set<T>, setB: Set<T>): Set<T> =>
      new Set([...setA].filter((x) => !setB.has(x)));

    // Keep settled production (Ready or finished Error); drop it only while still running.
    if (
      isProductionFieldSettled(fields.prodOutput?.status) &&
      isProductionFieldSettled(fields.prodCtx?.status)
    ) {
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
      originalBlockInfo.kind,
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
      this.applyDerivedArgs(blockId, newConfig, storageJson);
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
        // Legacy blocks (modelAPIVersion 1): persist block pack, set prerunArgs = currentArgs.
        // Their model reports no issues.
        persistBlockPack();
        if (info.fields.currentArgs !== undefined) {
          this.setBlockFieldObj(blockId, "currentPrerunArgs", info.fields.currentArgs);
        }
        this.deleteBlockFields(
          blockId,
          "currentDraftArgs",
          "currentArgsIssues",
          "currentDraftPrerunArgs",
          "currentPrerunArgsIssues",
        );
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
    this.meta = normalizeProjectMeta(meta);
    this.metaChanged = true;
    this.updateLastModified();
  }

  /**
   * Updates the metadata fields the caller names, leaving the rest as they are.
   *
   * The merge happens against the metadata this mutator loaded inside the very transaction it
   * writes in, so a rename and a description edit racing each other cannot make one of them
   * revert the other's field.
   */
  public updateMeta(patch: Partial<ProjectMeta>): void {
    this.setMeta({ ...this.meta, ...patch });
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

    for (const name of this.leftoverFields) this.tx.removeField(field(this.rid, name));
    this.leftoverFields = [];

    for (const [name, ref] of this.createdFields)
      this.tx.createField(field(this.rid, name), "Dynamic", ref);
    this.createdFields.clear();

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
    rid: SignedResourceId,
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

      // `f.error` is carried separately from `f.value`: a field that errored has no value
      // resource to read a status off, so this is the only trace the failure leaves here.
      const fieldError = isNotNullSignedResourceId(f.error);
      info.fields[projectField.fieldName] = isNullSignedResourceId(f.value)
        ? { modCount: 0, fieldError }
        : { modCount: 0, ref: f.value, fieldError };
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
      // Left by an older middle layer: dropped below, once the structure is known.
      if (hasOnlyFieldsUnknownToOlderRuntimes(fields)) return;
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
      if (isNotNullSignedResourceId(result.error)) state.status = "Error";
      else if (result.resourceReady || isNotNullSignedResourceId(result.originalResourceId))
        state.status = "Ready";
      else state.status = "NotReady";

      // For block pack we need to traverse the ref field from the resource data
      if (fieldName === "blockPack") {
        const refField = (result as ResourceData).fields.find((f) => f.name === Pl.HolderRefField);
        if (refField === undefined) throw new Error("Block pack ref field is missing");
        blockPackRequests.push([
          info,
          tx.getResourceData(ensureSignedResourceIdNotNull(refField.value), false),
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
      // Read off the container before `extractConfig`'s result replaces it as the
      // only thing we keep. Costs no round-trip — `bpInfo` is already in hand.
      info.blockKind = bpInfo.config.kind;
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
      ctxExportTplHolder = ensureSignedResourceIdNotNull(ctxExportTplField.value);
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

    // A block absent from the structure whose every field is one an older middle layer does not
    // know is what that middle layer leaves when it deletes the block: not a broken project.
    const blocksInStructure = new Set([...allBlocks(structure)].map((b) => b.id));
    blockInfoStates.forEach(({ id, fields }) => {
      if (blocksInStructure.has(id)) return;
      if (hasOnlyFieldsUnknownToOlderRuntimes(fields)) blockInfoStates.delete(id);
    });
    const leftoverFields = fullResourceState.fields
      .map((f) => f.name)
      .filter((name) => {
        const projectField = parseProjectField(name);
        return (
          projectField !== undefined &&
          !blocksInStructure.has(projectField.blockId) &&
          !blockInfoStates.has(projectField.blockId)
        );
      });

    const blockInfos = new Map<string, BlockInfo>();
    blockInfoStates.forEach(({ id, fields, blockConfig, blockKind, blockPack }) =>
      blockInfos.set(
        id,
        new BlockInfo(
          id,
          fields,
          notEmpty(blockConfig),
          notEmpty(blockPack),
          blockKind,
          projectHelper.logger,
        ),
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
      leftoverFields,
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
): Promise<ResourceRef> {
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
  sourceRid: SignedResourceId,
  options?: { label?: string },
  /**
   * Optional model access, used only to compute the precise drop set when the source has running
   * production (see below). Omitted, or a non-current schema → conservative all-or-nothing drop
   * (still correct, less selective). Interactive callers pass it for precision; callers without a
   * handy helper (sharing, CLI) omit it.
   */
  projectHelper?: ProjectHelper,
): Promise<ResourceRef> {
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

  // Production fields (prodOutput/prodCtx/prodUiCtx/prodArgs) are copied by reference — the copy
  // points at the SAME backend resources. Safe only for *settled* production (Ready or finished
  // Error, both immutable); a running (NotReady) block would tie the copy to the source's live
  // computation. Errored production is kept on purpose — sharing a failed project is a valid case.
  //
  // Drop running blocks plus their downstream closure (a finished block's prodCtx is built from its
  // upstreams' — see createProdCtx — so keeping it while dropping a running upstream breaks the
  // chain). The closure needs the model-layer dependency graph (ProjectHelper + current schema):
  //   - fast path: cheap resource-level scan; nothing running → copy all production;
  //   - precise path: something running, graph available → drop running blocks + downstream closure;
  //   - fallback: something running, no graph (no helper / unmigrated schema) → drop ALL production.
  //     Conservative, but always chain-consistent.
  const prodFields = new Set<ProjectField["fieldName"]>([
    "prodOutput",
    "prodCtx",
    "prodUiCtx",
    "prodArgs",
  ]);

  // Has this target settled (data will no longer change: Ready, deduplicated, or finished-error)?
  // Schema-agnostic, no model layer. Exactly the canonical readyOrDuplicateOrError predicate, which
  // matches the field-status rule in ProjectMutator.load (NotReady iff none of those hold).
  const isTargetSettled = async (rid: SignedResourceId | undefined): Promise<boolean> => {
    if (rid === undefined || isNullSignedResourceId(rid)) return false;
    try {
      const r = await tx.getResourceData(rid, false);
      return readyOrDuplicateOrError(r);
    } catch {
      // Gone/inaccessible → not settled: drop and re-derive in the copy rather than fail the whole
      // duplicate.
      return false;
    }
  };

  // Collect each block's prodOutput/prodCtx targets (the blocks that have production).
  const prodCoreByBlock = new Map<
    string,
    { prodOutput?: SignedResourceId; prodCtx?: SignedResourceId }
  >();
  for (const f of sourceData.fields) {
    if (isNullSignedResourceId(f.value)) continue;
    const parsed = parseProjectField(f.name);
    if (parsed === undefined) continue;
    if (parsed.fieldName === "prodOutput" || parsed.fieldName === "prodCtx") {
      const core = prodCoreByBlock.get(parsed.blockId) ?? {};
      core[parsed.fieldName] = f.value;
      prodCoreByBlock.set(parsed.blockId, core);
    }
  }
  const anyRunning = (
    await Promise.all(
      [...prodCoreByBlock.values()].map(
        async (core) =>
          !((await isTargetSettled(core.prodOutput)) && (await isTargetSettled(core.prodCtx))),
      ),
    )
  ).some((running) => running);

  let dropProduction: ReadonlySet<string>;
  if (!anyRunning) {
    dropProduction = new Set(); // fast path: all production settled (Ready/error) → copy as-is
  } else if (projectHelper !== undefined && schema === SchemaVersionCurrent) {
    // Precise path: drop running blocks + their downstream closure, computed from the source's
    // dependency graph. The copy shares the source's block ids, so the set applies directly.
    const srcMutator = await ProjectMutator.load(projectHelper, tx, sourceRid);
    dropProduction = srcMutator.productionBlocksToDropForCopy();
  } else {
    // Fallback: no graph available → drop all production (every block that has any).
    dropProduction = new Set(prodCoreByBlock.keys());
  }

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
      // Copy as-is. Limbo entries are left untouched: a limbo block's production is Ready (kept, so
      // never dropped), and a stale entry self-heals when the copy is opened.
      tx.setKValue(newPrj, key, value);
    }
  }

  // Set fresh timestamps
  tx.setKValue(newPrj, ProjectCreatedTimestamp, ts);
  tx.setKValue(newPrj, ProjectLastModifiedTimestamp, ts);

  // Fields an older middle layer left behind for blocks it deleted are not copied.
  const sourceStructureKV = sourceKVs.find((kv) => kv.key === ProjectStructureKey);
  const sourceStructure: ProjectStructure | undefined =
    sourceStructureKV === undefined ? undefined : JSON.parse(sourceStructureKV.value);
  const sourceBlocks =
    sourceStructure === undefined
      ? undefined
      : new Set([...allBlocks(sourceStructure)].map((b) => b.id));

  // Copy only persistent block fields (FieldsToDuplicate).
  // Transient fields (prodChainCtx, staging*, *Previous) are rebuilt on project open
  // by fixProblemsAndMigrate(). Copying them is both unnecessary and dangerous:
  // some fields use raw FieldRefs (not holder-wrapped) whose values may be NullSignedResourceId
  // at snapshot time, leading to partially copied field groups and broken project state.
  for (const f of sourceData.fields) {
    if (isNullSignedResourceId(f.value)) continue;
    const parsed = parseProjectField(f.name);
    if (parsed !== undefined && !FieldsToDuplicate.has(parsed.fieldName)) continue;
    if (
      parsed !== undefined &&
      FieldsUnknownToOlderRuntimes.has(parsed.fieldName) &&
      sourceBlocks !== undefined &&
      !sourceBlocks.has(parsed.blockId)
    )
      continue;
    // Drop production for running blocks and their downstream closure (see above).
    if (
      parsed !== undefined &&
      prodFields.has(parsed.fieldName) &&
      dropProduction.has(parsed.blockId)
    )
      continue;
    tx.createField(field(newPrj, f.name), "Dynamic", f.value);
  }

  return newPrj;
}

export async function withProject<T>(
  projectHelper: ProjectHelper,
  txOrPl: PlTransaction | PlClient,
  rid: SignedResourceId,
  cb: (p: ProjectMutator) => T | Promise<T>,
  ops?: Partial<TxOps>,
): Promise<T> {
  return withProjectAuthored(projectHelper, txOrPl, rid, undefined, cb, ops);
}

export async function withProjectAuthored<T>(
  projectHelper: ProjectHelper,
  txOrPl: PlTransaction | PlClient,
  rid: SignedResourceId,
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
