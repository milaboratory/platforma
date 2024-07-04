import { BlockContextAny } from '../middle_layer/block_ctx';
import { QuickJSContext, QuickJSHandle, Scope } from 'quickjs-emscripten';
import { PlTreeNodeAccessor } from '@milaboratory/pl-tree';
import { ComputableCtx } from '@milaboratory/computable';
import { randomUUID } from 'node:crypto';
import {
  CommonFieldTraverseOps as CommonFieldTraverseOpsFromSDK,
  FieldTraversalStep as FieldTraversalStepFromSDK,
  ResourceType as ResourceTypeFromSDK,
  JsRenderInternal
} from '@milaboratory/sdk-ui';
import { VmFunctionImplementation } from 'quickjs-emscripten-core';

export class JsExecutionContext implements JsRenderInternal.GlobalCfgRenderCtxMethods<string> {
  /** Must be disposed */
  private readonly callbackRegistry: QuickJSHandle;
  private readonly fnJSONStringify: QuickJSHandle;
  private readonly fnJSONParse: QuickJSHandle;

  private computableCtx: ComputableCtx | undefined;
  private readonly accessors = new Map<string, PlTreeNodeAccessor | undefined>();

  constructor(
    private readonly scope: Scope,
    private readonly vm: QuickJSContext,
    private readonly blockCtx: BlockContextAny,
    computableCtx: ComputableCtx
  ) {
    this.computableCtx = computableCtx;
    this.callbackRegistry = this.scope.manage(this.vm.newObject());

    this.fnJSONStringify = scope.manage(
      vm.getProp(vm.global, 'JSON')
        .consume(json => vm.getProp(json, 'stringify')));
    if (vm.typeof(this.fnJSONStringify) !== 'function')
      throw new Error(`JSON.stringify() not found.`);

    this.fnJSONParse = scope.manage(
      vm.getProp(vm.global, 'JSON')
        .consume(json => vm.getProp(json, 'parse')));
    if (vm.typeof(this.fnJSONParse) !== 'function')
      throw new Error(`JSON.parse() not found.`);

    this.injectCtx();
  }

  public resetComputableCtx() {
    this.computableCtx = undefined;
    this.accessors.clear();
  }

  public evaluateBundle(code: string) {
    this.vm.unwrapResult(
      this.vm.evalCode(code, undefined, { type: 'global' }))
      .dispose();
  }

  public runCallback(cbName: string, ...args: unknown[]): unknown {
    return Scope.withScope(localScope => {
      const targetCallback = localScope.manage(
        this.vm.getProp(this.callbackRegistry, cbName));

      if (this.vm.typeof(targetCallback) !== 'function')
        throw new Error(`No such callback: ${cbName}`);

      return this.vm.unwrapResult(this.vm.callFunction(targetCallback, this.vm.undefined,
        ...args.map(arg => localScope.manage(this.exportObjectViaJson(arg)))))
        .consume(result => this.importObjectViaJson(result));
    });
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
        if (lambda === undefined)
          throw new Error('Staging context not available');
        const entry = lambda(this.computableCtx!);
        if (!entry)
          this.accessors.set(name, undefined);
        else
          this.accessors.set(name, this.computableCtx!.accessor(entry).node());
      }
      return this.accessors.get(name) ? name : undefined;
    };
    if (name === 'staging')
      return wellKnownAccessor('staging', 'staging');
    else if (name === 'main')
      return wellKnownAccessor('main', 'prod');
    return undefined;
  }

  resolveWithCommon(handle: string,
                    commonOptions: CommonFieldTraverseOpsFromSDK,
                    ...steps: (FieldTraversalStepFromSDK | string)[]): string | undefined {
    return this.wrapAccessor(
      this.getAccessor(handle).traverseWithCommon(commonOptions, ...steps));
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

  getKeyValue(handle: string, key: string): ArrayBuffer | undefined {
    return this.getAccessor(handle).getKeyValue(key);
  }

  getKeyValueAsString(handle: string, key: string): string | undefined {
    return this.getAccessor(handle).getKeyValueAsString(key);
  }

  getData(handle: string): ArrayBuffer | undefined {
    return this.getAccessor(handle).getData();
  }

  getDataAsString(handle: string): string | undefined {
    return this.getAccessor(handle).getDataAsString();
  }

  //
  // Helpers
  //

  private getAccessor(handle: string): PlTreeNodeAccessor {
    const accessor = this.accessors.get(handle);
    if (accessor === undefined)
      throw new Error('No such accessor');
    return accessor;
  }

  private wrapAccessor(accessor: PlTreeNodeAccessor | undefined): string | undefined {
    if (accessor === undefined)
      return undefined;
    else {
      const nextHandle = randomUUID();
      this.accessors.set(nextHandle, accessor);
      return nextHandle;
    }
  }

  //
  // QuickJS Helpers
  //

  private exportArrayBuffer(buf: ArrayBuffer | undefined,
                            scope?: Scope): QuickJSHandle {
    if (buf === undefined)
      return this.vm.undefined;
    else if (scope === undefined)
      return this.vm.newArrayBuffer(buf);
    else
      return scope.manage(this.vm.newArrayBuffer(buf));
  }

  private exportSingleValue(obj: boolean | number | string | unknown | null,
                            scope?: Scope): QuickJSHandle {
    const result = this.tryExportSingleValue(obj);
    if (result === undefined)
      throw new Error(`Can't export value: ${obj}`);
    return result;
  }

  private tryExportSingleValue(obj: unknown, scope?: Scope): QuickJSHandle | undefined {
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
        return undefined;
    }
    return manage && scope != undefined ? scope.manage(handle) : handle;
  }

  private exportObjectViaJson(obj: unknown): QuickJSHandle {
    return this.vm.newString(JSON.stringify(obj))
      .consume(json =>
        this.vm.unwrapResult(this.vm.callFunction(this.fnJSONParse, this.vm.undefined, json))
      );
  }

  private importObjectViaJson(handle: QuickJSHandle): unknown {
    return JSON.parse(
      this.vm.unwrapResult(this.vm.callFunction(
        this.fnJSONStringify, this.vm.undefined, handle))
        .consume(strHandle => this.vm.getString(strHandle))
    );
  }

  private injectCtx() {
    Scope.withScope(localScope => {
      const configCtx = localScope.manage(this.vm.newObject());

      // Exporting props

      this.vm.setProp(configCtx, 'args', localScope.manage(this.vm.newString(this.blockCtx.args)));
      if (this.blockCtx.uiState !== undefined)
        this.vm.setProp(configCtx, 'uiState', localScope.manage(this.vm.newString(this.blockCtx.args)));

      this.vm.setProp(configCtx, 'callbackRegistry', this.callbackRegistry);

      // Exporting methods

      const exportCtxFunction = (name: string, fn: VmFunctionImplementation<QuickJSHandle>): void => {
        this.vm.newFunction(name, fn)
          .consume(fnh => this.vm.setProp(configCtx, name, fnh));
      };

      exportCtxFunction('getAccessorHandleByName', (name) => {
        return this.exportSingleValue(
          this.getAccessorHandleByName(this.vm.getString(name)));
      });

      exportCtxFunction('resolveWithCommon', (handle, commonOptions, ...steps) => {
        return this.exportSingleValue(
          this.resolveWithCommon(this.vm.getString(handle),
            this.importObjectViaJson(commonOptions) as CommonFieldTraverseOpsFromSDK,
            ...steps.map(step =>
              this.importObjectViaJson(step) as FieldTraversalStepFromSDK | string)));
      });

      exportCtxFunction('getResourceType', (handle) => {
        return this.exportObjectViaJson(
          this.getResourceType(this.vm.getString(handle)));
      });

      exportCtxFunction('getInputsLocked', (handle) => {
        return this.exportSingleValue(
          this.getInputsLocked(this.vm.getString(handle)));
      });

      exportCtxFunction('getOutputsLocked', (handle) => {
        return this.exportSingleValue(
          this.getOutputsLocked(this.vm.getString(handle)));
      });

      exportCtxFunction('getIsReadyOrError', (handle) => {
        return this.exportSingleValue(
          this.getIsReadyOrError(this.vm.getString(handle)));
      });

      exportCtxFunction('getIsFinal', (handle) => {
        return this.exportSingleValue(
          this.getIsFinal(this.vm.getString(handle)));
      });

      exportCtxFunction('getError', (handle) => {
        return this.exportSingleValue(
          this.getError(this.vm.getString(handle)));
      });

      exportCtxFunction('listInputFields', (handle) => {
        return this.exportObjectViaJson(
          this.listInputFields(this.vm.getString(handle)));
      });

      exportCtxFunction('listOutputFields', (handle) => {
        return this.exportObjectViaJson(
          this.listInputFields(this.vm.getString(handle)));
      });

      exportCtxFunction('listDynamicFields', (handle) => {
        return this.exportObjectViaJson(
          this.listInputFields(this.vm.getString(handle)));
      });

      exportCtxFunction('getKeyValue', (handle, key) => {
        return this.exportArrayBuffer(
          this.getKeyValue(this.vm.getString(handle), this.vm.getString(key)));
      });

      exportCtxFunction('getKeyValueAsString', (handle, key) => {
        return this.exportSingleValue(
          this.getKeyValueAsString(this.vm.getString(handle), this.vm.getString(key)));
      });

      exportCtxFunction('getData', (handle) => {
        return this.exportArrayBuffer(
          this.getData(this.vm.getString(handle)));
      });

      exportCtxFunction('getDataAsString', (handle) => {
        return this.exportSingleValue(
          this.getDataAsString(this.vm.getString(handle)));
      });

      this.vm.setProp(this.vm.global, 'cfgRenderCtx', configCtx);
    });
  }
}
