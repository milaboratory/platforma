import type { ComputableCtx } from "@milaboratories/computable";
import { Computable } from "@milaboratories/computable";
import type { PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import { checkBlockFlag } from "@platforma-sdk/model";
import type {
  ArchiveFormat,
  CommonFieldTraverseOps as CommonFieldTraverseOpsFromSDK,
  DataInfo,
  FieldTraversalStep as FieldTraversalStepFromSDK,
  Option,
  PColumn,
  PColumnValues,
  PFrameDef,
  PFrameHandle,
  PObject,
  PObjectSpec,
  PSpecPredicate,
  PTableDef,
  PTableDefV2,
  PTableHandle,
  ResourceType as ResourceTypeFromSDK,
  ResultCollection,
  ValueOrError,
  RangeBytes,
  BlockCodeKnownFeatureFlags,
  JsRenderInternal,
} from "@platforma-sdk/model";
import {
  isDataInfo,
  mapDataInfo,
  mapPObjectData,
  mapPTableDef,
  mapPTableDefV2,
  mapValueInVOE,
} from "@platforma-sdk/model";
import { notEmpty } from "@milaboratories/ts-helpers";
import { randomUUID } from "node:crypto";
import type { Optional } from "utility-types";
import type { BlockContextAny } from "../middle_layer/block_ctx";
import type { MiddleLayerEnvironment } from "../middle_layer/middle_layer";
import type { Block } from "../model/project_model";
import { parseFinalPObjectCollection } from "../pool/p_object_collection";
import type { ResultPool } from "../pool/result_pool";
import type { JsExecutionContext } from "./context";
import ivm from "isolated-vm";

function bytesToBase64(data: Uint8Array | undefined): string | undefined {
  return data !== undefined ? Buffer.from(data).toString("base64") : undefined;
}

export class ComputableContextHelper implements JsRenderInternal.GlobalCfgRenderCtxMethods<
  string,
  string
> {
  public readonly computablesToResolve: Record<string, Computable<unknown>> = {};

  private computableCtx: ComputableCtx | undefined;
  private readonly accessors = new Map<string, PlTreeNodeAccessor | undefined>();

  private readonly meta: Map<string, Block>;

  constructor(
    private readonly parent: JsExecutionContext,
    private readonly blockCtx: BlockContextAny,
    private readonly env: MiddleLayerEnvironment,
    private readonly featureFlags: BlockCodeKnownFeatureFlags | undefined,
    computableCtx: ComputableCtx,
  ) {
    this.computableCtx = computableCtx;
    this.meta = blockCtx.blockMeta(computableCtx);
  }

  public resetComputableCtx() {
    this.computableCtx = undefined;
    this.accessors.clear();
  }

  //
  // Methods for injected ctx object
  //

  getAccessorHandleByName(name: string): string | undefined {
    if (this.computableCtx === undefined)
      throw new Error("Accessors can't be used in this context");
    const wellKnownAccessor = (name: string, ctxKey: "staging" | "prod"): string | undefined => {
      if (!this.accessors.has(name)) {
        const lambda = this.blockCtx[ctxKey];
        if (lambda === undefined) throw new Error("Staging context not available");
        const entry = lambda(this.computableCtx!);
        if (!entry) this.accessors.set(name, undefined);
        else
          this.accessors.set(name, this.computableCtx!.accessor(entry).node({ ignoreError: true }));
      }
      return this.accessors.get(name) ? name : undefined;
    };
    if (name === "staging") return wellKnownAccessor("staging", "staging");
    else if (name === "main") return wellKnownAccessor("main", "prod");
    return undefined;
  }

  //
  // Accessors
  //

  resolveWithCommon(
    handle: string,
    commonOptions: CommonFieldTraverseOpsFromSDK,
    ...steps: (FieldTraversalStepFromSDK | string)[]
  ): string | undefined {
    return this.wrapAccessor(this.getAccessor(handle).traverseWithCommon(commonOptions, ...steps));
  }

  getResourceType(handle: string): ResourceTypeFromSDK {
    return this.getAccessor(handle).resourceType;
  }

  getInputsLocked(handle: string): boolean {
    return this.getAccessor(handle).getInputsLocked();
  }

  getOutputsLocked(handle: string): boolean {
    return this.getAccessor(handle).getOutputsLocked();
  }

  getIsReadyOrError(handle: string): boolean {
    return this.getAccessor(handle).getIsReadyOrError();
  }

  getIsFinal(handle: string): boolean {
    return this.getAccessor(handle).getIsFinal();
  }

  getError(handle: string): string | undefined {
    return this.wrapAccessor(this.getAccessor(handle).getError());
  }

  listInputFields(handle: string): string[] {
    return this.getAccessor(handle).listInputFields();
  }

  listOutputFields(handle: string): string[] {
    return this.getAccessor(handle).listOutputFields();
  }

  listDynamicFields(handle: string): string[] {
    return this.getAccessor(handle).listDynamicFields();
  }

  getKeyValueBase64(handle: string, key: string): string | undefined {
    return bytesToBase64(this.getAccessor(handle).getKeyValue(key));
  }

  getKeyValueAsString(handle: string, key: string): string | undefined {
    return this.getAccessor(handle).getKeyValueAsString(key);
  }

  getDataBase64(handle: string): string | undefined {
    return bytesToBase64(this.getAccessor(handle).getData());
  }

  getDataAsString(handle: string): string | undefined {
    return this.getAccessor(handle).getDataAsString();
  }

  //
  // Accessor helpers
  //

  parsePObjectCollection(
    handle: string,
    errorOnUnknownField: boolean,
    prefix: string,
    ...resolveSteps: string[]
  ): Record<string, PObject<string>> | undefined {
    const acc = this.getAccessor(handle);
    if (!acc.getIsReadyOrError()) return undefined;
    const accResult = parseFinalPObjectCollection(acc, errorOnUnknownField, prefix, resolveSteps);
    const result: Record<string, PObject<string>> = {};
    for (const [key, obj] of Object.entries(accResult)) {
      result[key] = mapPObjectData(obj, (d) => this.wrapAccessor(d));
    }
    return result;
  }

  //
  // Blobs
  //

  private registerComputable(hPrefix: string, computable: Computable<unknown>): string {
    const fHandle = `${hPrefix}_${randomUUID()}`;
    this.computablesToResolve[fHandle] = computable;
    return fHandle;
  }

  public getBlobContentAsString(handle: string, range?: RangeBytes): string {
    const resourceInfo = this.getAccessor(handle).resourceInfo;
    return this.registerComputable(
      "getBlobContentAsString",
      Computable.make((ctx) => this.env.driverKit.blobDriver.getDownloadedBlob(resourceInfo, ctx), {
        postprocessValue: async (value) => {
          if (value === undefined) return undefined;
          return Buffer.from(
            await this.env.driverKit.blobDriver.getContent(value.handle, range),
          ).toString("utf-8");
        },
      }),
    );
  }

  public getBlobContentAsBase64(handle: string, range?: RangeBytes): string {
    const resourceInfo = this.getAccessor(handle).resourceInfo;
    return this.registerComputable(
      "getBlobContentAsBase64",
      Computable.make((ctx) => this.env.driverKit.blobDriver.getDownloadedBlob(resourceInfo, ctx), {
        postprocessValue: async (value) => {
          if (value === undefined) return undefined;
          return Buffer.from(
            await this.env.driverKit.blobDriver.getContent(value.handle, range),
          ).toString("base64");
        },
      }),
    );
  }

  public getDownloadedBlobContentHandle(handle: string): string {
    const resourceInfo = this.getAccessor(handle).resourceInfo;
    return this.registerComputable(
      "getDownloadedBlobContentHandle",
      this.env.driverKit.blobDriver.getDownloadedBlob(resourceInfo),
    );
  }

  public getOnDemandBlobContentHandle(handle: string): string {
    const resource = this.getAccessor(handle).persist();
    return this.registerComputable(
      "getOnDemandBlobContentHandle",
      this.env.driverKit.blobDriver.getOnDemandBlob(resource),
    );
  }

  //
  // Blobs to URLs
  //

  public extractArchiveAndGetURL(handle: string, format: ArchiveFormat): string {
    const resource = this.getAccessor(handle).persist();
    return this.registerComputable(
      "extractArchiveAndGetURL",
      this.env.driverKit.blobToURLDriver.extractArchiveAndGetURL(resource, format),
    );
  }

  //
  // Import progress
  //

  getImportProgress(handle: string): string {
    const resource = this.getAccessor(handle).persist();
    return this.registerComputable(
      "getImportProgress",
      this.env.driverKit.uploadDriver.getProgressId(resource),
    );
  }

  //
  // Logs
  //

  getLastLogs(handle: string, nLines: number): string {
    const resource = this.getAccessor(handle).persist();
    return this.registerComputable(
      "getLastLogs",
      this.env.driverKit.logDriver.getLastLogs(resource, nLines),
    );
  }

  getProgressLog(handle: string, patternToSearch: string): string {
    const resource = this.getAccessor(handle).persist();
    return this.registerComputable(
      "getProgressLog",
      this.env.driverKit.logDriver.getProgressLog(resource, patternToSearch),
    );
  }

  getProgressLogWithInfo(handle: string, patternToSearch: string): string {
    const resource = this.getAccessor(handle).persist();
    return this.registerComputable(
      "getProgressLogWithInfo",
      this.env.driverKit.logDriver.getProgressLogWithInfo(resource, patternToSearch),
    );
  }

  getLogHandle(handle: string): string {
    const resource = this.getAccessor(handle).persist();
    return this.registerComputable(
      "getLogHandle",
      this.env.driverKit.logDriver.getLogHandle(resource),
    );
  }

  //
  // Blocks
  //

  public getBlockLabel(blockId: string): string {
    const b = this.meta.get(blockId);
    if (b === undefined) throw new Error(`Block ${blockId} not found.`);
    return b.label;
  }

  //
  // Result Pool
  //

  private _resultPool: ResultPool | undefined = undefined;
  private get resultPool(): ResultPool {
    if (this._resultPool === undefined) {
      if (this.computableCtx === undefined)
        throw new Error(
          "can't use result pool in this context (most porbably called from the future mapper)",
        );
      this._resultPool = notEmpty(
        this.blockCtx.getResultsPool,
        "getResultsPool",
      )(this.computableCtx);
    }
    return this._resultPool;
  }

  public calculateOptions(predicate: PSpecPredicate): Option[] {
    return this.resultPool.calculateOptions(predicate);
  }

  public getDataFromResultPool(): ResultCollection<PObject<string>> {
    const collection = this.resultPool.getData();
    if (collection.instabilityMarker !== undefined)
      this.computableCtx!.markUnstable(`incomplete_result_pool:${collection.instabilityMarker}`);
    return {
      isComplete: collection.isComplete,
      entries: collection.entries.map((e) => ({
        ref: e.ref,
        obj: mapPObjectData(e.obj, (d) => this.wrapAccessor(d)),
      })),
    };
  }

  public getDataWithErrorsFromResultPool(): ResultCollection<
    Optional<PObject<ValueOrError<string, Error>>, "id">
  > {
    const collection = this.resultPool.getDataWithErrors();
    if (collection.instabilityMarker !== undefined)
      this.computableCtx!.markUnstable(`incomplete_result_pool:${collection.instabilityMarker}`);
    return {
      isComplete: collection.isComplete,
      entries: collection.entries.map((e) => ({
        ref: e.ref,
        obj: {
          id: e.obj.id,
          spec: e.obj.spec,
          data: mapValueInVOE(e.obj.data, (d) => this.wrapAccessor(d)),
        },
      })),
    };
  }

  public getSpecsFromResultPool(): ResultCollection<PObjectSpec> {
    const specs = this.resultPool.getSpecs();
    if (specs.instabilityMarker !== undefined)
      this.computableCtx!.markUnstable(`specs_from_pool_incomplete:${specs.instabilityMarker}`);
    return specs;
  }

  getSpecFromResultPoolByRef(blockId: string, exportName: string): PObjectSpec | undefined {
    return this.resultPool.getSpecByRef(blockId, exportName);
  }

  getDataFromResultPoolByRef(blockId: string, exportName: string): PObject<string> | undefined {
    return mapPObjectData(this.resultPool.getDataByRef(blockId, exportName), (acc) =>
      this.wrapAccessor(acc),
    );
  }

  //
  // PFrames / PTables
  //

  public createPFrame(
    def: PFrameDef<PColumn<string | PColumnValues | DataInfo<string>>>,
  ): PFrameHandle {
    if (this.computableCtx === undefined)
      throw new Error(
        "can't instantiate PFrames from this context (most porbably called from the future mapper)",
      );
    const { key, unref } = this.env.driverKit.pFrameDriver.createPFrame(
      def.map((c) => mapPObjectData(c, (d) => this.transformInputPData(d))),
    );
    this.computableCtx.addOnDestroy(unref);
    return key;
  }

  public createPTable(
    def: PTableDef<PColumn<string | PColumnValues | DataInfo<string>>>,
  ): PTableHandle {
    if (this.computableCtx === undefined)
      throw new Error(
        "can't instantiate PTable from this context (most porbably called from the future mapper)",
      );
    const { key, unref } = this.env.driverKit.pFrameDriver.createPTable(
      mapPTableDef(def, (c) => mapPObjectData(c, (d) => this.transformInputPData(d))),
    );
    this.computableCtx.addOnDestroy(unref);
    return key;
  }
  public createPTableV2(
    def: PTableDefV2<PColumn<string | PColumnValues | DataInfo<string>>>,
  ): PTableHandle {
    if (this.computableCtx === undefined)
      throw new Error(
        "can't instantiate PTable from this context (most porbably called from the future mapper)",
      );
    const { key, unref } = this.env.driverKit.pFrameDriver.createPTableV2(
      mapPTableDefV2(def, (c) => mapPObjectData(c, (d) => this.transformInputPData(d))),
    );
    this.computableCtx.addOnDestroy(unref);
    return key;
  }

  /**
   * Transforms input data for PFrame/PTable creation
   * - Converts string handles to accessors
   * - Maps accessors in DataInfo objects
   * - Passes through other values
   */
  private transformInputPData(
    d: string | PColumnValues | DataInfo<string>,
  ): PlTreeNodeAccessor | PColumnValues | DataInfo<PlTreeNodeAccessor> {
    if (typeof d === "string") {
      return this.getAccessor(d);
    } else if (isDataInfo(d)) {
      return mapDataInfo(d, (a) => this.getAccessor(a));
    } else {
      return d;
    }
  }

  //
  // Computable
  //

  public getCurrentUnstableMarker(): string | undefined {
    return this.computableCtx?.unstableMarker;
  }

  //
  // Logging
  //

  public logInfo(message: string): void {
    this.env.blockEventDispatcher.logInfo(this.blockCtx.blockId, message);
  }

  public logWarn(message: string): void {
    this.env.blockEventDispatcher.logWarn(this.blockCtx.blockId, message);
  }

  public logError(message: string): void {
    this.env.blockEventDispatcher.logError(this.blockCtx.blockId, message);
  }

  //
  // Helpers
  //

  private getAccessor(handle: string): PlTreeNodeAccessor {
    const accessor = this.accessors.get(handle);
    if (accessor === undefined) throw new Error("No such accessor");
    return accessor;
  }

  private wrapAccessor(accessor: PlTreeNodeAccessor): string;
  private wrapAccessor(accessor: PlTreeNodeAccessor | undefined): string | undefined;
  private wrapAccessor(accessor: PlTreeNodeAccessor | undefined): string | undefined {
    if (accessor === undefined) return undefined;
    else {
      const nextHandle = randomUUID();
      this.accessors.set(nextHandle, accessor);
      return nextHandle;
    }
  }

  public injectCtx(cfgRef: ivm.Reference<Record<string, unknown>>): void {
    const parent = this.parent;

    /**
     * Helper to export a host function into the isolate's cfgRenderCtx.
     * Wraps with error caching (UUID-based ErrorRepository).
     */
    const exportCtxFunction = (name: string, fn: (...args: any[]) => unknown): void => {
      const withCachedError = (...args: any[]) => {
        try {
          return fn(...args);
        } catch (e: unknown) {
          throw parent.errorRepo.setAndRecreateForSandbox(e);
        }
      };

      cfgRef.setSync(name, new ivm.Callback(withCachedError));
      cfgRef.setSync(name + "__internal__", new ivm.Callback(fn));
    };

    // Check if this is a v1/v2 block (requiresModelAPIVersion !== 2)
    // For v1/v2 blocks, state is {args, uiState} and we need to inject uiState separately
    const isLegacyBlock = !checkBlockFlag(this.featureFlags, "requiresModelAPIVersion", 2);

    // Helper to extract uiState from legacy state format {args, uiState}
    const extractUiState = (stateJson: string | undefined): string => {
      if (!stateJson) return "{}";
      try {
        const parsed = JSON.parse(stateJson);
        return JSON.stringify(parsed?.uiState ?? {});
      } catch {
        return "{}";
      }
    };

    if (checkBlockFlag(this.featureFlags, "supportsLazyState")) {
      // injecting lazy state functions
      exportCtxFunction("args", () => {
        if (this.computableCtx === undefined)
          throw new Error(
            `Add dummy call to ctx.args outside the future lambda. Can't be directly used in this context.`,
          );
        const args = this.blockCtx.args(this.computableCtx);
        return args === undefined ? undefined : args;
      });
      exportCtxFunction("blockStorage", () => {
        if (this.computableCtx === undefined)
          throw new Error(
            `Add dummy call to ctx.blockStorage outside the future lambda. Can't be directly used in this context.`,
          );
        return this.blockCtx.blockStorage(this.computableCtx) ?? "{}";
      });
      exportCtxFunction("data", () => {
        if (this.computableCtx === undefined)
          throw new Error(
            `Add dummy call to ctx.data outside the future lambda. Can't be directly used in this context.`,
          );
        return this.blockCtx.data(this.computableCtx) ?? "{}";
      });
      exportCtxFunction("activeArgs", () => {
        if (this.computableCtx === undefined)
          throw new Error(
            `Add dummy call to ctx.activeArgs outside the future lambda. Can't be directly used in this context.`,
          );
        const res = this.blockCtx.activeArgs(this.computableCtx);
        return res === undefined ? undefined : res;
      });
      // For v1/v2 blocks, also inject uiState (extracted from state.uiState)
      if (isLegacyBlock) {
        exportCtxFunction("uiState", () => {
          if (this.computableCtx === undefined)
            throw new Error(
              `Add dummy call to ctx.uiState outside the future lambda. Can't be directly used in this context.`,
            );
          return extractUiState(this.blockCtx.data(this.computableCtx));
        });
      }
    } else {
      const args = this.blockCtx.args(this.computableCtx!);
      const activeArgs = this.blockCtx.activeArgs(this.computableCtx!);
      const data = this.blockCtx.data(this.computableCtx!);
      if (args !== undefined) {
        cfgRef.setSync("args", new ivm.ExternalCopy(args).copyInto());
      }
      cfgRef.setSync("data", new ivm.ExternalCopy(data ?? "{}").copyInto());
      if (activeArgs !== undefined)
        cfgRef.setSync("activeArgs", new ivm.ExternalCopy(activeArgs).copyInto());
      // For v1/v2 blocks, also inject uiState (extracted from state.uiState)
      if (isLegacyBlock) {
        cfgRef.setSync("uiState", new ivm.ExternalCopy(extractUiState(data)).copyInto());
      }
    }

    //
    // Methods for injected ctx object
    //

    exportCtxFunction("getAccessorHandleByName", (name: string) => {
      return this.getAccessorHandleByName(name);
    });

    //
    // Accessors
    //

    exportCtxFunction(
      "resolveWithCommon",
      (handle: string, commonOptions: any, ...steps: any[]) => {
        return this.resolveWithCommon(
          handle,
          commonOptions as CommonFieldTraverseOpsFromSDK,
          ...steps.map((step: any) => step as FieldTraversalStepFromSDK | string),
        );
      },
    );

    exportCtxFunction("getResourceType", (handle: string) => {
      return new ivm.ExternalCopy(this.getResourceType(handle)).copyInto();
    });

    exportCtxFunction("getInputsLocked", (handle: string) => {
      return this.getInputsLocked(handle);
    });

    exportCtxFunction("getOutputsLocked", (handle: string) => {
      return this.getOutputsLocked(handle);
    });

    exportCtxFunction("getIsReadyOrError", (handle: string) => {
      return this.getIsReadyOrError(handle);
    });

    exportCtxFunction("getIsFinal", (handle: string) => {
      return this.getIsFinal(handle);
    });

    exportCtxFunction("getError", (handle: string) => {
      return this.getError(handle);
    });

    exportCtxFunction("listInputFields", (handle: string) => {
      return new ivm.ExternalCopy(this.listInputFields(handle)).copyInto();
    });

    exportCtxFunction("listOutputFields", (handle: string) => {
      return new ivm.ExternalCopy(this.listInputFields(handle)).copyInto();
    });

    exportCtxFunction("listDynamicFields", (handle: string) => {
      return new ivm.ExternalCopy(this.listInputFields(handle)).copyInto();
    });

    exportCtxFunction("getKeyValueBase64", (handle: string, key: string) => {
      return this.getKeyValueBase64(handle, key);
    });

    exportCtxFunction("getKeyValueAsString", (handle: string, key: string) => {
      return this.getKeyValueAsString(handle, key);
    });

    exportCtxFunction("getDataBase64", (handle: string) => {
      return this.getDataBase64(handle);
    });

    exportCtxFunction("getDataAsString", (handle: string) => {
      return this.getDataAsString(handle);
    });

    //
    // Accessor helpers
    //

    exportCtxFunction(
      "parsePObjectCollection",
      (handle: string, errorOnUnknownField: boolean, prefix: string, ...resolveSteps: string[]) => {
        const result = this.parsePObjectCollection(
          handle,
          errorOnUnknownField,
          prefix,
          ...resolveSteps,
        );
        return result === undefined ? undefined : new ivm.ExternalCopy(result).copyInto();
      },
    );

    //
    // Blobs
    //

    exportCtxFunction("getBlobContentAsBase64", (handle: string, range?: RangeBytes) => {
      return this.getBlobContentAsBase64(handle, range);
    });

    exportCtxFunction("getBlobContentAsString", (handle: string, range?: RangeBytes) => {
      return this.getBlobContentAsString(handle, range);
    });

    exportCtxFunction("getDownloadedBlobContentHandle", (handle: string) => {
      return this.getDownloadedBlobContentHandle(handle);
    });

    exportCtxFunction("getOnDemandBlobContentHandle", (handle: string) => {
      return this.getOnDemandBlobContentHandle(handle);
    });

    //
    // Blobs to URLs
    //

    exportCtxFunction("extractArchiveAndGetURL", (handle: string, format: string) => {
      return this.extractArchiveAndGetURL(handle, format as ArchiveFormat);
    });

    //
    // ImportProgress
    //

    exportCtxFunction("getImportProgress", (handle: string) => {
      return this.getImportProgress(handle);
    });

    //
    // Logs
    //

    exportCtxFunction("getLastLogs", (handle: string, nLines: number) => {
      return this.getLastLogs(handle, nLines);
    });

    exportCtxFunction("getProgressLog", (handle: string, patternToSearch: string) => {
      return this.getProgressLog(handle, patternToSearch);
    });

    exportCtxFunction("getProgressLogWithInfo", (handle: string, patternToSearch: string) => {
      return this.getProgressLogWithInfo(handle, patternToSearch);
    });

    exportCtxFunction("getLogHandle", (handle: string) => {
      return this.getLogHandle(handle);
    });

    //
    // Blocks
    //

    exportCtxFunction("getBlockLabel", (blockId: string) => {
      return this.getBlockLabel(blockId);
    });

    //
    // Result pool
    //

    exportCtxFunction("getDataFromResultPool", () => {
      return new ivm.ExternalCopy(this.getDataFromResultPool()).copyInto();
    });

    exportCtxFunction("getDataWithErrorsFromResultPool", () => {
      return new ivm.ExternalCopy(this.getDataWithErrorsFromResultPool()).copyInto();
    });

    exportCtxFunction("getSpecsFromResultPool", () => {
      return new ivm.ExternalCopy(this.getSpecsFromResultPool()).copyInto();
    });

    exportCtxFunction("calculateOptions", (predicate: PSpecPredicate) => {
      return new ivm.ExternalCopy(this.calculateOptions(predicate)).copyInto();
    });

    exportCtxFunction("getSpecFromResultPoolByRef", (blockId: string, exportName: string) => {
      const result = this.getSpecFromResultPoolByRef(blockId, exportName);
      return result === undefined ? undefined : new ivm.ExternalCopy(result).copyInto();
    });

    exportCtxFunction("getDataFromResultPoolByRef", (blockId: string, exportName: string) => {
      const result = this.getDataFromResultPoolByRef(blockId, exportName);
      return result === undefined ? undefined : new ivm.ExternalCopy(result).copyInto();
    });

    //
    // PFrames / PTables
    //

    exportCtxFunction("createPFrame", (def: any) => {
      return this.createPFrame(def as PFrameDef<PColumn<string | PColumnValues>>);
    });

    exportCtxFunction("createPTable", (def: any) => {
      return this.createPTable(def as PTableDef<PColumn<string | PColumnValues>>);
    });

    exportCtxFunction("createPTableV2", (def: any) => {
      return this.createPTableV2(def as PTableDefV2<PColumn<string | PColumnValues>>);
    });

    //
    // Computable
    //

    exportCtxFunction("getCurrentUnstableMarker", () => {
      return this.getCurrentUnstableMarker();
    });

    //
    // Logging
    //

    exportCtxFunction("logInfo", (message: string) => {
      this.logInfo(message);
    });

    exportCtxFunction("logWarn", (message: string) => {
      this.logWarn(message);
    });

    exportCtxFunction("logError", (message: string) => {
      this.logError(message);
    });
  }
}
