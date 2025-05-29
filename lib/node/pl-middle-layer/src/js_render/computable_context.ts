import type { ComputableCtx } from '@milaboratories/computable';
import { Computable } from '@milaboratories/computable';
import type { PlTreeNodeAccessor } from '@milaboratories/pl-tree';
import type {
  JsRenderInternal,
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
  PTableHandle,
  ResourceType as ResourceTypeFromSDK,
  ResultCollection,
  ValueOrError,
  RangeBytes,
} from '@platforma-sdk/model';
import {
  isDataInfo,
  mapDataInfo,
  mapPObjectData,
  mapPTableDef,
  mapValueInVOE,
} from '@platforma-sdk/model';
import { notEmpty } from '@milaboratories/ts-helpers';
import { randomUUID } from 'node:crypto';
import type { Optional } from 'utility-types';
import type { BlockContextAny } from '../middle_layer/block_ctx';
import type { MiddleLayerEnvironment } from '../middle_layer/middle_layer';
import type { Block } from '../model/project_model';
import { parseFinalPObjectCollection } from '../pool/p_object_collection';
import type { ResultPool } from '../pool/result_pool';
import type { JsExecutionContext } from './context';
import type { VmFunctionImplementation } from 'quickjs-emscripten';
import { Scope, type QuickJSHandle } from 'quickjs-emscripten';

function bytesToBase64(data: Uint8Array | undefined): string | undefined {
  return data !== undefined ? Buffer.from(data).toString('base64') : undefined;
}

export class ComputableContextHelper
implements JsRenderInternal.GlobalCfgRenderCtxMethods<string, string> {
  public readonly computablesToResolve: Record<string, Computable<unknown>> = {};

  private computableCtx: ComputableCtx | undefined;
  private readonly accessors = new Map<string, PlTreeNodeAccessor | undefined>();

  private readonly meta: Map<string, Block>;

  constructor(
    private readonly parent: JsExecutionContext,
    private readonly blockCtx: BlockContextAny,
    private readonly env: MiddleLayerEnvironment,
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
      throw new Error('Accessors can\'t be used in this context');
    const wellKnownAccessor = (name: string, ctxKey: 'staging' | 'prod'): string | undefined => {
      if (!this.accessors.has(name)) {
        const lambda = this.blockCtx[ctxKey];
        if (lambda === undefined) throw new Error('Staging context not available');
        const entry = lambda(this.computableCtx!);
        if (!entry) this.accessors.set(name, undefined);
        else
          this.accessors.set(name, this.computableCtx!.accessor(entry).node({ ignoreError: true }));
      }
      return this.accessors.get(name) ? name : undefined;
    };
    if (name === 'staging') return wellKnownAccessor('staging', 'staging');
    else if (name === 'main') return wellKnownAccessor('main', 'prod');
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
      'getBlobContentAsString',
      Computable.make((ctx) => this.env.driverKit.blobDriver.getDownloadedBlob(resourceInfo, ctx), {
        postprocessValue: async (value) => {
          if (value === undefined) return undefined;
          return Buffer.from(await this.env.driverKit.blobDriver.getContent(value.handle, range)).toString(
            'utf-8',
          );
        },
      }),
    );
  }

  public getBlobContentAsBase64(handle: string, range?: RangeBytes): string {
    const resourceInfo = this.getAccessor(handle).resourceInfo;
    return this.registerComputable(
      'getBlobContentAsBase64',
      Computable.make((ctx) => this.env.driverKit.blobDriver.getDownloadedBlob(resourceInfo, ctx), {
        postprocessValue: async (value) => {
          if (value === undefined) return undefined;
          return Buffer.from(await this.env.driverKit.blobDriver.getContent(value.handle, range)).toString(
            'base64',
          );
        },
      }),
    );
  }

  public getDownloadedBlobContentHandle(handle: string): string {
    const resourceInfo = this.getAccessor(handle).resourceInfo;
    return this.registerComputable(
      'getDownloadedBlobContentHandle',
      this.env.driverKit.blobDriver.getDownloadedBlob(resourceInfo),
    );
  }

  public getOnDemandBlobContentHandle(handle: string): string {
    const resource = this.getAccessor(handle).persist();
    return this.registerComputable(
      'getOnDemandBlobContentHandle',
      this.env.driverKit.blobDriver.getOnDemandBlob(resource),
    );
  }

  //
  // Blobs to URLs
  //

  public extractArchiveAndGetURL(handle: string, format: ArchiveFormat): string {
    const resource = this.getAccessor(handle).persist();
    return this.registerComputable(
      'extractArchiveAndGetURL',
      this.env.driverKit.blobToURLDriver.extractArchiveAndGetURL(resource, format),
    );
  }

  //
  // Import progress
  //

  getImportProgress(handle: string): string {
    const resource = this.getAccessor(handle).persist();
    return this.registerComputable(
      'getImportProgress',
      this.env.driverKit.uploadDriver.getProgressId(resource),
    );
  }

  //
  // Logs
  //

  getLastLogs(handle: string, nLines: number): string {
    const resource = this.getAccessor(handle).persist();
    return this.registerComputable(
      'getLastLogs',
      this.env.driverKit.logDriver.getLastLogs(resource, nLines),
    );
  }

  getProgressLog(handle: string, patternToSearch: string): string {
    const resource = this.getAccessor(handle).persist();
    return this.registerComputable(
      'getProgressLog',
      this.env.driverKit.logDriver.getProgressLog(resource, patternToSearch),
    );
  }

  getProgressLogWithInfo(handle: string, patternToSearch: string): string {
    const resource = this.getAccessor(handle).persist();
    return this.registerComputable(
      'getProgressLogWithInfo',
      this.env.driverKit.logDriver.getProgressLogWithInfo(resource, patternToSearch),
    );
  }

  getLogHandle(handle: string): string {
    const resource = this.getAccessor(handle).persist();
    return this.registerComputable(
      'getLogHandle',
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
          'can\'t use result pool in this context (most porbably called from the future mapper)',
        );
      this._resultPool = notEmpty(
        this.blockCtx.getResultsPool,
        'getResultsPool',
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
    Optional<PObject<ValueOrError<string, Error>>, 'id'>
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

  public createPFrame(def: PFrameDef<string | PColumnValues | DataInfo<string>>): PFrameHandle {
    if (this.computableCtx === undefined)
      throw new Error(
        'can\'t instantiate PFrames from this context (most porbably called from the future mapper)',
      );
    return this.env.driverKit.pFrameDriver.createPFrame(
      def.map((c) => mapPObjectData(c, (d) => this.transformInputPData(d))),
      this.computableCtx,
    );
  }

  public createPTable(def: PTableDef<PColumn<string | PColumnValues | DataInfo<string>>>): PTableHandle {
    if (this.computableCtx === undefined)
      throw new Error(
        'can\'t instantiate PTable from this context (most porbably called from the future mapper)',
      );
    return this.env.driverKit.pFrameDriver.createPTable(
      mapPTableDef(def, (c) =>
        mapPObjectData(c, (d) => this.transformInputPData(d)),
      ),
      this.computableCtx,
    );
  }

  /**
   * Transforms input data for PFrame/PTable creation
   * - Converts string handles to accessors
   * - Maps accessors in DataInfo objects
   * - Passes through other values
   */
  private transformInputPData(d: string | PColumnValues | DataInfo<string>): PlTreeNodeAccessor | PColumnValues | DataInfo<PlTreeNodeAccessor> {
    if (typeof d === 'string') {
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
    if (accessor === undefined) throw new Error('No such accessor');
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

  public injectCtx(configCtx: QuickJSHandle): void {
    const parent = this.parent;
    const vm = parent.vm;

    Scope.withScope((localScope) => {
      // Exporting props

      const args = this.blockCtx.args(this.computableCtx!);
      const activeArgs = this.blockCtx.activeArgs(this.computableCtx!);
      const uiState = this.blockCtx.uiState(this.computableCtx!);
      vm.setProp(configCtx, 'args', localScope.manage(vm.newString(args)));
      if (uiState !== undefined)
        vm.setProp(configCtx, 'uiState', localScope.manage(vm.newString(uiState)));
      if (activeArgs !== undefined)
        vm.setProp(configCtx, 'activeArgs', localScope.manage(vm.newString(activeArgs)));

      // Exporting methods

      const exportCtxFunction = (
        name: string,
        fn: VmFunctionImplementation<QuickJSHandle>,
      ): void => {
        const withCachedError: VmFunctionImplementation<QuickJSHandle> = (...args) => {
        // QuickJS strips all fields from errors apart from 'name' and 'message'.
        // That's why here we need to store them, and rethrow them when we exit
        // from QuickJS code.
          try {
            return (fn as any)(...args);
          } catch (e: unknown) {
            const newErr = parent.errorRepo.setAndRecreateForQuickJS(e);

            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw vm.newError(newErr);
          }
        };

        vm.newFunction(name, withCachedError).consume((fnh) => vm.setProp(configCtx, name, fnh));
        vm.newFunction(name, fn).consume((fnh) => vm.setProp(configCtx, name + '__internal__', fnh));
      };

      //
      // Methods for injected ctx object
      //

      exportCtxFunction('getAccessorHandleByName', (name) => {
        return parent.exportSingleValue(
          this.getAccessorHandleByName(vm.getString(name)),
          undefined,
        );
      });

      //
      // Accessors
      //

      exportCtxFunction('resolveWithCommon', (handle, commonOptions, ...steps) => {
        return parent.exportSingleValue(
          this.resolveWithCommon(
            vm.getString(handle),
            parent.importObjectViaJson(commonOptions) as CommonFieldTraverseOpsFromSDK,
            ...steps.map(
              (step) => parent.importObjectViaJson(step) as FieldTraversalStepFromSDK | string,
            ),
          ),
          undefined,
        );
      });

      exportCtxFunction('getResourceType', (handle) => {
        return parent.exportObjectViaJson(this.getResourceType(vm.getString(handle)), undefined);
      });

      exportCtxFunction('getInputsLocked', (handle) => {
        return parent.exportSingleValue(this.getInputsLocked(vm.getString(handle)), undefined);
      });

      exportCtxFunction('getOutputsLocked', (handle) => {
        return parent.exportSingleValue(this.getOutputsLocked(vm.getString(handle)), undefined);
      });

      exportCtxFunction('getIsReadyOrError', (handle) => {
        return parent.exportSingleValue(this.getIsReadyOrError(vm.getString(handle)), undefined);
      });

      exportCtxFunction('getIsFinal', (handle) => {
        return parent.exportSingleValue(this.getIsFinal(vm.getString(handle)), undefined);
      });

      exportCtxFunction('getError', (handle) => {
        return parent.exportSingleValue(this.getError(vm.getString(handle)), undefined);
      });

      exportCtxFunction('listInputFields', (handle) => {
        return parent.exportObjectViaJson(this.listInputFields(vm.getString(handle)), undefined);
      });

      exportCtxFunction('listOutputFields', (handle) => {
        return parent.exportObjectViaJson(this.listInputFields(vm.getString(handle)), undefined);
      });

      exportCtxFunction('listDynamicFields', (handle) => {
        return parent.exportObjectViaJson(this.listInputFields(vm.getString(handle)), undefined);
      });

      exportCtxFunction('getKeyValueBase64', (handle, key) => {
        return parent.exportSingleValue(
          this.getKeyValueBase64(vm.getString(handle), vm.getString(key)),
          undefined,
        );
      });

      exportCtxFunction('getKeyValueAsString', (handle, key) => {
        return parent.exportSingleValue(
          this.getKeyValueAsString(vm.getString(handle), vm.getString(key)),
          undefined,
        );
      });

      exportCtxFunction('getDataBase64', (handle) => {
        return parent.exportSingleValue(this.getDataBase64(vm.getString(handle)), undefined);
      });

      exportCtxFunction('getDataAsString', (handle) => {
        return parent.exportSingleValue(this.getDataAsString(vm.getString(handle)), undefined);
      });

      //
      // Accessor helpers
      //

      exportCtxFunction(
        'parsePObjectCollection',
        (handle, errorOnUnknownField, prefix, ...resolveSteps) => {
          return parent.exportObjectUniversal(
            this.parsePObjectCollection(
              vm.getString(handle),
              vm.dump(errorOnUnknownField) as boolean,
              vm.getString(prefix),
              ...resolveSteps.map((stepHandle) => vm.getString(stepHandle)),
            ),
            undefined,
          );
        },
      );

      //
      // Blobs
      //

      exportCtxFunction('getBlobContentAsBase64', (handle, range) => {
        return parent.exportSingleValue(
          this.getBlobContentAsBase64(vm.getString(handle), parent.importObjectUniversal(range) as RangeBytes | undefined),
          undefined,
        );
      });

      exportCtxFunction('getBlobContentAsString', (handle, range) => {
        return parent.exportSingleValue(
          this.getBlobContentAsString(vm.getString(handle), parent.importObjectUniversal(range) as RangeBytes | undefined),
          undefined,
        );
      });

      exportCtxFunction('getDownloadedBlobContentHandle', (handle) => {
        return parent.exportSingleValue(
          this.getDownloadedBlobContentHandle(vm.getString(handle)),
          undefined,
        );
      });

      exportCtxFunction('getOnDemandBlobContentHandle', (handle) => {
        return parent.exportSingleValue(
          this.getOnDemandBlobContentHandle(vm.getString(handle)),
          undefined,
        );
      });

      //
      // Blobs to URLs
      //

      exportCtxFunction('extractArchiveAndGetURL', (handle, format) => {
        return parent.exportSingleValue(
          this.extractArchiveAndGetURL(vm.getString(handle), vm.getString(format) as ArchiveFormat),
          undefined);
      });

      //
      // ImportProgress
      //

      exportCtxFunction('getImportProgress', (handle) => {
        return parent.exportSingleValue(this.getImportProgress(vm.getString(handle)), undefined);
      });

      //
      // Logs
      //

      exportCtxFunction('getLastLogs', (handle, nLines) => {
        return parent.exportSingleValue(
          this.getLastLogs(vm.getString(handle), vm.getNumber(nLines)),
          undefined,
        );
      });

      exportCtxFunction('getProgressLog', (handle, patternToSearch) => {
        return parent.exportSingleValue(
          this.getProgressLog(vm.getString(handle), vm.getString(patternToSearch)),
          undefined,
        );
      });

      exportCtxFunction('getProgressLogWithInfo', (handle, patternToSearch) => {
        return parent.exportSingleValue(
          this.getProgressLogWithInfo(vm.getString(handle), vm.getString(patternToSearch)),
          undefined,
        );
      });

      exportCtxFunction('getLogHandle', (handle) => {
        return parent.exportSingleValue(this.getLogHandle(vm.getString(handle)), undefined);
      });

      //
      // Blocks
      //

      exportCtxFunction('getBlockLabel', (blockId) => {
        return parent.exportSingleValue(this.getBlockLabel(vm.getString(blockId)), undefined);
      });

      //
      // Result pool
      //

      exportCtxFunction('getDataFromResultPool', () => {
        return parent.exportObjectUniversal(this.getDataFromResultPool(), undefined);
      });

      exportCtxFunction('getDataWithErrorsFromResultPool', () => {
        return parent.exportObjectUniversal(this.getDataWithErrorsFromResultPool(), undefined);
      });

      exportCtxFunction('getSpecsFromResultPool', () => {
        return parent.exportObjectUniversal(this.getSpecsFromResultPool(), undefined);
      });

      exportCtxFunction('calculateOptions', (predicate) => {
        return parent.exportObjectUniversal(
          this.calculateOptions(parent.importObjectViaJson(predicate) as PSpecPredicate),
          undefined,
        );
      });

      exportCtxFunction('getSpecFromResultPoolByRef', (blockId, exportName) => {
        return parent.exportObjectUniversal(
          this.getSpecFromResultPoolByRef(
            vm.getString(blockId),
            vm.getString(exportName),
          ),
          undefined,
        );
      });

      exportCtxFunction('getDataFromResultPoolByRef', (blockId, exportName) => {
        return parent.exportObjectUniversal(
          this.getDataFromResultPoolByRef(
            vm.getString(blockId),
            vm.getString(exportName),
          ),
          undefined,
        );
      });

      //
      // PFrames / PTables
      //

      exportCtxFunction('createPFrame', (def) => {
        return parent.exportSingleValue(
          this.createPFrame(parent.importObjectViaJson(def) as PFrameDef<string | PColumnValues>),
          undefined,
        );
      });

      exportCtxFunction('createPTable', (def) => {
        return parent.exportSingleValue(
          this.createPTable(
            parent.importObjectViaJson(def) as PTableDef<PColumn<string | PColumnValues>>,
          ),
          undefined,
        );
      });

      //
      // Computable
      //

      exportCtxFunction('getCurrentUnstableMarker', () => {
        return parent.exportSingleValue(this.getCurrentUnstableMarker(), undefined);
      });

      //
      // Logging
      //

      exportCtxFunction('logInfo', (message) => {
        this.logInfo(vm.getString(message));
      });

      exportCtxFunction('logWarn', (message) => {
        this.logWarn(vm.getString(message));
      });

      exportCtxFunction('logError', (message) => {
        this.logError(vm.getString(message));
      });
    });
  }
}
