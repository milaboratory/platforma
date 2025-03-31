import type { ComputableCtx } from '@milaboratories/computable';
import { Computable } from '@milaboratories/computable';
import type { PlTreeNodeAccessor } from '@milaboratories/pl-tree';
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
  PTableHandle,
  ResourceType as ResourceTypeFromSDK,
  ResultCollection,
  ValueOrError,
} from '@platforma-sdk/model';
import {
  isDataInfo,
  JsRenderInternal,
  mapDataInfo,
  mapPObjectData,
  mapPTableDef,
  mapValueInVOE,
} from '@platforma-sdk/model';
import { notEmpty } from '@milaboratories/ts-helpers';
import { randomUUID } from 'node:crypto';
import type { QuickJSContext, QuickJSHandle, VmFunctionImplementation } from 'quickjs-emscripten';
import { Scope, errors } from 'quickjs-emscripten';
import type { Optional } from 'utility-types';
import type { BlockContextAny } from '../middle_layer/block_ctx';
import type { MiddleLayerEnvironment } from '../middle_layer/middle_layer';
import type { Block } from '../model/project_model';
import { parseFinalPObjectCollection } from '../pool/p_object_collection';
import type { ResultPool } from '../pool/result_pool';
import { stringifyWithResourceId } from '@milaboratories/pl-client';
import { PlQuickJSError } from '@milaboratories/pl-errors';

function isArrayBufferOrView(obj: unknown): obj is ArrayBufferLike {
  return obj instanceof ArrayBuffer || ArrayBuffer.isView(obj);
}

function bytesToBase64(data: Uint8Array | undefined): string | undefined {
  return data !== undefined ? Buffer.from(data).toString('base64') : undefined;
}

export class JsExecutionContext
implements JsRenderInternal.GlobalCfgRenderCtxMethods<string, string> {
  private readonly callbackRegistry: QuickJSHandle;
  private readonly fnJSONStringify: QuickJSHandle;
  private readonly fnJSONParse: QuickJSHandle;

  public readonly computablesToResolve: Record<string, Computable<unknown>> = {};

  private computableCtx: ComputableCtx | undefined;
  private readonly accessors = new Map<string, PlTreeNodeAccessor | undefined>();

  private readonly meta: Map<string, Block>;

  private readonly errorRepo = new ErrorRepository();

  constructor(
    private readonly scope: Scope,
    private readonly vm: QuickJSContext,
    private readonly blockCtx: BlockContextAny,
    private readonly env: MiddleLayerEnvironment,
    computableCtx: ComputableCtx,
  ) {
    this.computableCtx = computableCtx;
    this.callbackRegistry = this.scope.manage(this.vm.newObject());

    this.fnJSONStringify = scope.manage(
      vm.getProp(vm.global, 'JSON').consume((json) => vm.getProp(json, 'stringify')),
    );
    if (vm.typeof(this.fnJSONStringify) !== 'function')
      throw new Error(`JSON.stringify() not found.`);

    this.fnJSONParse = scope.manage(
      vm.getProp(vm.global, 'JSON').consume((json) => vm.getProp(json, 'parse')),
    );
    if (vm.typeof(this.fnJSONParse) !== 'function') throw new Error(`JSON.parse() not found.`);

    this.meta = blockCtx.blockMeta(computableCtx);

    this.injectCtx();
  }

  public resetComputableCtx() {
    this.computableCtx = undefined;
    this.accessors.clear();
  }

  private static cleanErrorContext(error: unknown): void {
    if (typeof error === 'object' && error !== null && 'context' in error) delete error['context'];
  }

  public evaluateBundle(code: string) {
    try {
      this.vm.unwrapResult(this.vm.evalCode(code, 'bundle.js', { type: 'global' })).dispose();
    } catch (err: unknown) {
      JsExecutionContext.cleanErrorContext(err);
      throw err;
    }
  }

  public runCallback(cbName: string, ...args: unknown[]): QuickJSHandle {
    try {
      return Scope.withScope((localScope) => {
        const targetCallback = localScope.manage(this.vm.getProp(this.callbackRegistry, cbName));

        if (this.vm.typeof(targetCallback) !== 'function')
          throw new Error(`No such callback: ${cbName}`);

        return this.scope.manage(
          this.vm.unwrapResult(
            this.vm.callFunction(
              targetCallback,
              this.vm.undefined,
              ...args.map((arg) => this.exportObjectUniversal(arg, localScope)),
            ),
          ),
        );
      });
    } catch (err: unknown) {
      JsExecutionContext.cleanErrorContext(err);
      const original = this.errorRepo.getOriginal(err);
      throw original;
    }
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

  public getBlobContentAsString(handle: string): string {
    const resourceInfo = this.getAccessor(handle).resourceInfo;
    return this.registerComputable(
      'getBlobContentAsString',
      Computable.make((ctx) => this.env.driverKit.blobDriver.getDownloadedBlob(resourceInfo, ctx), {
        postprocessValue: async (value) => {
          if (value === undefined) return undefined;
          return Buffer.from(await this.env.driverKit.blobDriver.getContent(value.handle)).toString(
            'utf-8',
          );
        },
      }),
    );
  }

  public getBlobContentAsBase64(handle: string): string {
    const resourceInfo = this.getAccessor(handle).resourceInfo;
    return this.registerComputable(
      'getBlobContentAsBase64',
      Computable.make((ctx) => this.env.driverKit.blobDriver.getDownloadedBlob(resourceInfo, ctx), {
        postprocessValue: async (value) => {
          if (value === undefined) return undefined;
          return Buffer.from(await this.env.driverKit.blobDriver.getContent(value.handle)).toString(
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

  //
  // QuickJS Helpers
  //

  private exportSingleValue(
    obj: boolean | number | string | null | ArrayBuffer | undefined,
    scope: Scope | undefined,
  ): QuickJSHandle {
    const result = this.tryExportSingleValue(obj, scope);
    if (result === undefined) {
      throw new Error(`Can't export value: ${obj === undefined ? 'undefined' : JSON.stringify(obj)}`);
    }
    return result;
  }

  private tryExportSingleValue(obj: unknown, scope: Scope | undefined): QuickJSHandle | undefined {
    let handle: QuickJSHandle;
    let manage = false;
    switch (typeof obj) {
      case 'string':
        handle = this.vm.newString(obj);
        manage = true;
        break;
      case 'number':
        handle = this.vm.newNumber(obj);
        manage = true;
        break;
      case 'undefined':
        handle = this.vm.undefined;
        break;
      case 'boolean':
        handle = obj ? this.vm.true : this.vm.false;
        break;
      default:
        if (obj === null) {
          handle = this.vm.null;
          break;
        }
        if (isArrayBufferOrView(obj)) {
          handle = this.vm.newArrayBuffer(obj);
          manage = true;
          break;
        }
        return undefined;
    }
    return manage && scope != undefined ? scope.manage(handle) : handle;
  }

  public exportObjectUniversal(obj: unknown, scope: Scope | undefined): QuickJSHandle {
    const simpleHandle = this.tryExportSingleValue(obj, scope);
    if (simpleHandle !== undefined) return simpleHandle;
    return this.exportObjectViaJson(obj, scope);
  }

  public exportObjectViaJson(obj: unknown, scope: Scope | undefined): QuickJSHandle {
    const result = this.vm
      .newString(JSON.stringify(obj))
      .consume((json) =>
        this.vm.unwrapResult(this.vm.callFunction(this.fnJSONParse, this.vm.undefined, json)),
      );
    return scope !== undefined ? scope.manage(result) : result;
  }

  public importObjectUniversal(handle: QuickJSHandle): unknown {
    switch (this.vm.typeof(handle)) {
      case 'undefined':
        return undefined;
      case 'boolean':
      case 'number':
      case 'string':
        return this.vm.dump(handle);
      default:
        return this.importObjectViaJson(handle);
    }
  }

  public importObjectViaJson(handle: QuickJSHandle): unknown {
    const text = this.vm
      .unwrapResult(this.vm.callFunction(this.fnJSONStringify, this.vm.undefined, handle))
      .consume((strHandle) => this.vm.getString(strHandle));
    if (text === 'undefined')
      // special case with futures
      return undefined;
    return JSON.parse(text);
  }

  private injectCtx() {
    Scope.withScope((localScope) => {
      const configCtx = localScope.manage(this.vm.newObject());

      // Exporting props

      const args = this.blockCtx.args(this.computableCtx!);
      const activeArgs = this.blockCtx.activeArgs(this.computableCtx!);
      const uiState = this.blockCtx.uiState(this.computableCtx!);
      this.vm.setProp(configCtx, 'args', localScope.manage(this.vm.newString(args)));
      if (uiState !== undefined)
        this.vm.setProp(configCtx, 'uiState', localScope.manage(this.vm.newString(uiState)));
      if (activeArgs !== undefined)
        this.vm.setProp(configCtx, 'activeArgs', localScope.manage(this.vm.newString(activeArgs)));
      this.vm.setProp(configCtx, 'callbackRegistry', this.callbackRegistry);
      this.vm.setProp(
        configCtx,
        'featureFlags',
        this.exportObjectUniversal(JsRenderInternal.GlobalCfgRenderCtxFeatureFlags, localScope),
      );

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
            const newErr = this.errorRepo.setAndRecreateForQuickJS(e);
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw this.vm.newError(newErr);
          }
        };

        this.vm.newFunction(name, withCachedError).consume((fnh) => this.vm.setProp(configCtx, name, fnh));
        this.vm.newFunction(name, fn).consume((fnh) => this.vm.setProp(configCtx, name + '__internal__', fnh));
      };

      //
      // Methods for injected ctx object
      //

      exportCtxFunction('getAccessorHandleByName', (name) => {
        return this.exportSingleValue(
          this.getAccessorHandleByName(this.vm.getString(name)),
          undefined,
        );
      });

      //
      // Accessors
      //

      exportCtxFunction('resolveWithCommon', (handle, commonOptions, ...steps) => {
        return this.exportSingleValue(
          this.resolveWithCommon(
            this.vm.getString(handle),
            this.importObjectViaJson(commonOptions) as CommonFieldTraverseOpsFromSDK,
            ...steps.map(
              (step) => this.importObjectViaJson(step) as FieldTraversalStepFromSDK | string,
            ),
          ),
          undefined,
        );
      });

      exportCtxFunction('getResourceType', (handle) => {
        return this.exportObjectViaJson(this.getResourceType(this.vm.getString(handle)), undefined);
      });

      exportCtxFunction('getInputsLocked', (handle) => {
        return this.exportSingleValue(this.getInputsLocked(this.vm.getString(handle)), undefined);
      });

      exportCtxFunction('getOutputsLocked', (handle) => {
        return this.exportSingleValue(this.getOutputsLocked(this.vm.getString(handle)), undefined);
      });

      exportCtxFunction('getIsReadyOrError', (handle) => {
        return this.exportSingleValue(this.getIsReadyOrError(this.vm.getString(handle)), undefined);
      });

      exportCtxFunction('getIsFinal', (handle) => {
        return this.exportSingleValue(this.getIsFinal(this.vm.getString(handle)), undefined);
      });

      exportCtxFunction('getError', (handle) => {
        return this.exportSingleValue(this.getError(this.vm.getString(handle)), undefined);
      });

      exportCtxFunction('listInputFields', (handle) => {
        return this.exportObjectViaJson(this.listInputFields(this.vm.getString(handle)), undefined);
      });

      exportCtxFunction('listOutputFields', (handle) => {
        return this.exportObjectViaJson(this.listInputFields(this.vm.getString(handle)), undefined);
      });

      exportCtxFunction('listDynamicFields', (handle) => {
        return this.exportObjectViaJson(this.listInputFields(this.vm.getString(handle)), undefined);
      });

      exportCtxFunction('getKeyValueBase64', (handle, key) => {
        return this.exportSingleValue(
          this.getKeyValueBase64(this.vm.getString(handle), this.vm.getString(key)),
          undefined,
        );
      });

      exportCtxFunction('getKeyValueAsString', (handle, key) => {
        return this.exportSingleValue(
          this.getKeyValueAsString(this.vm.getString(handle), this.vm.getString(key)),
          undefined,
        );
      });

      exportCtxFunction('getDataBase64', (handle) => {
        return this.exportSingleValue(this.getDataBase64(this.vm.getString(handle)), undefined);
      });

      exportCtxFunction('getDataAsString', (handle) => {
        return this.exportSingleValue(this.getDataAsString(this.vm.getString(handle)), undefined);
      });

      //
      // Accessor helpers
      //

      exportCtxFunction(
        'parsePObjectCollection',
        (handle, errorOnUnknownField, prefix, ...resolveSteps) => {
          return this.exportObjectUniversal(
            this.parsePObjectCollection(
              this.vm.getString(handle),
              this.vm.dump(errorOnUnknownField) as boolean,
              this.vm.getString(prefix),
              ...resolveSteps.map((stepHandle) => this.vm.getString(stepHandle)),
            ),
            undefined,
          );
        },
      );

      //
      // Blobs
      //

      exportCtxFunction('getBlobContentAsBase64', (handle) => {
        return this.exportSingleValue(
          this.getBlobContentAsBase64(this.vm.getString(handle)),
          undefined,
        );
      });

      exportCtxFunction('getBlobContentAsString', (handle) => {
        return this.exportSingleValue(
          this.getBlobContentAsString(this.vm.getString(handle)),
          undefined,
        );
      });

      exportCtxFunction('getDownloadedBlobContentHandle', (handle) => {
        return this.exportSingleValue(
          this.getDownloadedBlobContentHandle(this.vm.getString(handle)),
          undefined,
        );
      });

      exportCtxFunction('getOnDemandBlobContentHandle', (handle) => {
        return this.exportSingleValue(
          this.getOnDemandBlobContentHandle(this.vm.getString(handle)),
          undefined,
        );
      });

      //
      // Blobs to URLs
      //

      exportCtxFunction('extractArchiveAndGetURL', (handle, format) => {
        return this.exportSingleValue(
          this.extractArchiveAndGetURL(this.vm.getString(handle), this.vm.getString(format) as ArchiveFormat),
          undefined);
      });

      //
      // ImportProgress
      //

      exportCtxFunction('getImportProgress', (handle) => {
        return this.exportSingleValue(this.getImportProgress(this.vm.getString(handle)), undefined);
      });

      //
      // Logs
      //

      exportCtxFunction('getLastLogs', (handle, nLines) => {
        return this.exportSingleValue(
          this.getLastLogs(this.vm.getString(handle), this.vm.getNumber(nLines)),
          undefined,
        );
      });

      exportCtxFunction('getProgressLog', (handle, patternToSearch) => {
        return this.exportSingleValue(
          this.getProgressLog(this.vm.getString(handle), this.vm.getString(patternToSearch)),
          undefined,
        );
      });

      exportCtxFunction('getProgressLogWithInfo', (handle, patternToSearch) => {
        return this.exportSingleValue(
          this.getProgressLogWithInfo(this.vm.getString(handle), this.vm.getString(patternToSearch)),
          undefined,
        );
      });

      exportCtxFunction('getLogHandle', (handle) => {
        return this.exportSingleValue(this.getLogHandle(this.vm.getString(handle)), undefined);
      });

      //
      // Blocks
      //

      exportCtxFunction('getBlockLabel', (blockId) => {
        return this.exportSingleValue(this.getBlockLabel(this.vm.getString(blockId)), undefined);
      });

      //
      // Result pool
      //

      exportCtxFunction('getDataFromResultPool', () => {
        return this.exportObjectUniversal(this.getDataFromResultPool(), undefined);
      });

      exportCtxFunction('getDataWithErrorsFromResultPool', () => {
        return this.exportObjectUniversal(this.getDataWithErrorsFromResultPool(), undefined);
      });

      exportCtxFunction('getSpecsFromResultPool', () => {
        return this.exportObjectUniversal(this.getSpecsFromResultPool(), undefined);
      });

      exportCtxFunction('calculateOptions', (predicate) => {
        return this.exportObjectUniversal(
          this.calculateOptions(this.importObjectViaJson(predicate) as PSpecPredicate),
          undefined,
        );
      });

      exportCtxFunction('getSpecFromResultPoolByRef', (blockId, exportName) => {
        return this.exportObjectUniversal(
          this.getSpecFromResultPoolByRef(
            this.vm.getString(blockId),
            this.vm.getString(exportName),
          ),
          undefined,
        );
      });

      exportCtxFunction('getDataFromResultPoolByRef', (blockId, exportName) => {
        return this.exportObjectUniversal(
          this.getDataFromResultPoolByRef(
            this.vm.getString(blockId),
            this.vm.getString(exportName),
          ),
          undefined,
        );
      });

      //
      // PFrames / PTables
      //

      exportCtxFunction('createPFrame', (def) => {
        return this.exportSingleValue(
          this.createPFrame(this.importObjectViaJson(def) as PFrameDef<string | PColumnValues>),
          undefined,
        );
      });

      exportCtxFunction('createPTable', (def) => {
        return this.exportSingleValue(
          this.createPTable(
            this.importObjectViaJson(def) as PTableDef<PColumn<string | PColumnValues>>,
          ),
          undefined,
        );
      });

      //
      // Computable
      //

      exportCtxFunction('getCurrentUnstableMarker', () => {
        return this.exportSingleValue(this.getCurrentUnstableMarker(), undefined);
      });

      this.vm.setProp(this.vm.global, 'cfgRenderCtx', configCtx);
    });
  }
}

/** Holds errors that happened in the host code (like in middle-layer's drivers)
 * and then throws it where the error from quick JS is needed.
 * QuickJS couldn't throw custom errors, so we store them here, and rethrow them when we exit QuickJS side. */
export class ErrorRepository {
  private readonly errorIdToError = new Map<string, unknown>();

  /** Sets the error to the repository and returns a mimicrated error that also has uuid key of the original error. */
  public setAndRecreateForQuickJS(error: unknown): {
    name: string;
    message: string;
  } {
    const errorId = randomUUID();
    this.errorIdToError.set(errorId, error);

    if (error instanceof Error) {
      return {
        name: `${error.name}/uuid:${errorId}`,
        message: error.message,
      };
    }

    return {
      name: `UnknownErrorQuickJS/uuid:${errorId}`,
      message: `${error as any}`,
    };
  }

  /** Returns the original error that was stored by parsing uuid of mimicrated error. */
  public getOriginal(quickJSError: unknown): unknown {
    if (!(quickJSError instanceof errors.QuickJSUnwrapError)) {
      console.warn('ErrorRepo: quickJSError is not a QuickJSUnwrapError', stringifyWithResourceId(quickJSError));
      return quickJSError;
    }

    if (!('name' in (quickJSError.cause as any))) {
      console.warn('ErrorRepo: quickJSError.cause is not an Error', stringifyWithResourceId(quickJSError));
      return quickJSError;
    }

    const causeName = (quickJSError.cause as any).name;
    const errorId = causeName.slice(causeName.indexOf('/uuid:') + '/uuid:'.length);
    if (!errorId) {
      throw new Error(`ErrorRepo: quickJSError.cause.name does not contain errorId: ${causeName}, ${stringifyWithResourceId(quickJSError)}`);
    }

    const error = this.errorIdToError.get(errorId);
    if (error === undefined) {
      throw new Error(`ErrorRepo: errorId not found: ${errorId}, ${stringifyWithResourceId(quickJSError)}`);
    }

    return new PlQuickJSError(quickJSError, error as Error);
  }
}
