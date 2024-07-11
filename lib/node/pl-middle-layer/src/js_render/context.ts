import { BlockContextAny } from '../middle_layer/block_ctx';
import { QuickJSContext, QuickJSHandle, Scope, VmFunctionImplementation } from 'quickjs-emscripten';
import { PlTreeNodeAccessor } from '@milaboratory/pl-tree';
import { Computable, ComputableCtx } from '@milaboratory/computable';
import { randomUUID } from 'node:crypto';
import {
  CommonFieldTraverseOps as CommonFieldTraverseOpsFromSDK,
  FieldTraversalStep as FieldTraversalStepFromSDK,
  ResourceType as ResourceTypeFromSDK,
  JsRenderInternal
} from '@milaboratory/sdk-ui';
import { MiddleLayerEnvironment } from '../middle_layer/middle_layer';

function isArrayBufferOrView(obj: unknown): obj is ArrayBufferLike {
  return obj instanceof ArrayBuffer || ArrayBuffer.isView(obj);
}

function bytesToBase64(data: Uint8Array | undefined): string | undefined {
  return data !== undefined ? Buffer.from(data).toString('base64') : undefined;
}

export class JsExecutionContext
  implements JsRenderInternal.GlobalCfgRenderCtxMethods<string, string>
{
  private readonly callbackRegistry: QuickJSHandle;
  private readonly fnJSONStringify: QuickJSHandle;
  private readonly fnJSONParse: QuickJSHandle;

  public readonly computablesToResolve: Record<string, Computable<any>> = {};

  private computableCtx: ComputableCtx | undefined;
  private readonly accessors = new Map<string, PlTreeNodeAccessor | undefined>();

  constructor(
    private readonly scope: Scope,
    private readonly vm: QuickJSContext,
    private readonly blockCtx: BlockContextAny,
    private readonly env: MiddleLayerEnvironment,
    computableCtx: ComputableCtx
  ) {
    this.computableCtx = computableCtx;
    this.callbackRegistry = this.scope.manage(this.vm.newObject());

    this.fnJSONStringify = scope.manage(
      vm.getProp(vm.global, 'JSON').consume((json) => vm.getProp(json, 'stringify'))
    );
    if (vm.typeof(this.fnJSONStringify) !== 'function')
      throw new Error(`JSON.stringify() not found.`);

    this.fnJSONParse = scope.manage(
      vm.getProp(vm.global, 'JSON').consume((json) => vm.getProp(json, 'parse'))
    );
    if (vm.typeof(this.fnJSONParse) !== 'function') throw new Error(`JSON.parse() not found.`);

    this.injectCtx();
  }

  public resetComputableCtx() {
    this.computableCtx = undefined;
    this.accessors.clear();
  }

  public evaluateBundle(code: string) {
    this.vm.unwrapResult(this.vm.evalCode(code, undefined, { type: 'global' })).dispose();
  }

  public runCallback(cbName: string, ...args: unknown[]): QuickJSHandle {
    return Scope.withScope((localScope) => {
      const targetCallback = localScope.manage(this.vm.getProp(this.callbackRegistry, cbName));

      if (this.vm.typeof(targetCallback) !== 'function')
        throw new Error(`No such callback: ${cbName}`);

      return this.scope.manage(
        this.vm.unwrapResult(
          this.vm.callFunction(
            targetCallback,
            this.vm.undefined,
            ...args.map((arg) => this.exportObjectUniversal(arg, localScope))
          )
        )
      );
    });
  }

  //
  // Methods for injected ctx object
  //

  getAccessorHandleByName(name: string): string | undefined {
    if (this.computableCtx === undefined)
      throw new Error("Accessors can't be used in this context");
    const wellKnownAccessor = (name: string, ctxKey: 'staging' | 'prod'): string | undefined => {
      if (!this.accessors.has(name)) {
        const lambda = this.blockCtx[ctxKey];
        if (lambda === undefined) throw new Error('Staging context not available');
        const entry = lambda(this.computableCtx!);
        if (!entry) this.accessors.set(name, undefined);
        else this.accessors.set(name, this.computableCtx!.accessor(entry).node());
      }
      return this.accessors.get(name) ? name : undefined;
    };
    if (name === 'staging') return wellKnownAccessor('staging', 'staging');
    else if (name === 'main') return wellKnownAccessor('main', 'prod');
    return undefined;
  }

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
  // Blobs
  //

  private registerComputable(hPrefix: string, computable: Computable<unknown>): string {
    const fHandle = `${hPrefix}_${randomUUID()}`;
    this.computablesToResolve[fHandle] = computable;
    return fHandle;
  }

  getBlobContentAsString(handle: string): string {
    const resourceInfo = this.getAccessor(handle).resourceInfo;
    return this.registerComputable(
      'getBlobContentAsString',
      Computable.make(
        (ctx) => this.env.drivers.downloadDriver.getDownloadedBlob(resourceInfo, ctx),
        {
          postprocessValue: async (value) => {
            if (value === undefined) return undefined;
            return Buffer.from(
              await this.env.drivers.downloadDriver.getContent(value.handle)
            ).toString('utf-8');
          }
        }
      )
    );
  }

  getBlobContentAsBase64(handle: string): string {
    const resourceInfo = this.getAccessor(handle).resourceInfo;
    return this.registerComputable(
      'getBlobContentAsBase64',
      Computable.make(
        (ctx) => this.env.drivers.downloadDriver.getDownloadedBlob(resourceInfo, ctx),
        {
          postprocessValue: async (value) => {
            if (value === undefined) return undefined;
            return Buffer.from(
              await this.env.drivers.downloadDriver.getContent(value.handle)
            ).toString('base64');
          }
        }
      )
    );
  }

  getDownloadedBlobContentHandle(handle: string): string {
    const resourceInfo = this.getAccessor(handle).resourceInfo;
    return this.registerComputable(
      'getDownloadedBlobContentHandle',
      this.env.drivers.downloadDriver.getDownloadedBlob(resourceInfo)
    );
  }

  getOnDemandBlobContentHandle(handle: string): string {
    const resourceInfo = this.getAccessor(handle).resourceInfo;
    return this.registerComputable(
      'getOnDemandBlobContentHandle',
      this.env.drivers.downloadDriver.getOnDemandBlob(resourceInfo)
    );
  }

  //
  // Helpers
  //

  private getAccessor(handle: string): PlTreeNodeAccessor {
    const accessor = this.accessors.get(handle);
    if (accessor === undefined) throw new Error('No such accessor');
    return accessor;
  }

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
    scope: Scope | undefined
  ): QuickJSHandle {
    const result = this.tryExportSingleValue(obj, scope);
    if (result === undefined) throw new Error(`Can't export value: ${obj}`);
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
        this.vm.unwrapResult(this.vm.callFunction(this.fnJSONParse, this.vm.undefined, json))
      );
    return scope !== undefined ? scope.manage(result) : result;
  }

  public importObjectUniversal(handle: QuickJSHandle): unknown {
    switch (this.vm.typeof(handle)) {
      case 'undefined':
        return undefined;
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

      this.vm.setProp(configCtx, 'args', localScope.manage(this.vm.newString(this.blockCtx.args)));
      if (this.blockCtx.uiState !== undefined)
        this.vm.setProp(
          configCtx,
          'uiState',
          localScope.manage(this.vm.newString(this.blockCtx.args))
        );

      this.vm.setProp(configCtx, 'callbackRegistry', this.callbackRegistry);

      // Exporting methods

      const exportCtxFunction = (
        name: string,
        fn: VmFunctionImplementation<QuickJSHandle>
      ): void => {
        this.vm.newFunction(name, fn).consume((fnh) => this.vm.setProp(configCtx, name, fnh));
      };

      exportCtxFunction('getAccessorHandleByName', (name) => {
        return this.exportSingleValue(
          this.getAccessorHandleByName(this.vm.getString(name)),
          undefined
        );
      });

      exportCtxFunction('resolveWithCommon', (handle, commonOptions, ...steps) => {
        return this.exportSingleValue(
          this.resolveWithCommon(
            this.vm.getString(handle),
            this.importObjectViaJson(commonOptions) as CommonFieldTraverseOpsFromSDK,
            ...steps.map(
              (step) => this.importObjectViaJson(step) as FieldTraversalStepFromSDK | string
            )
          ),
          undefined
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
          undefined
        );
      });

      exportCtxFunction('getKeyValueAsString', (handle, key) => {
        return this.exportSingleValue(
          this.getKeyValueAsString(this.vm.getString(handle), this.vm.getString(key)),
          undefined
        );
      });

      exportCtxFunction('getDataBase64', (handle) => {
        return this.exportSingleValue(this.getDataBase64(this.vm.getString(handle)), undefined);
      });

      exportCtxFunction('getDataAsString', (handle) => {
        return this.exportSingleValue(this.getDataAsString(this.vm.getString(handle)), undefined);
      });

      exportCtxFunction('getBlobContentAsBase64', (handle) => {
        return this.exportSingleValue(
          this.getBlobContentAsBase64(this.vm.getString(handle)),
          undefined
        );
      });

      exportCtxFunction('getBlobContentAsString', (handle) => {
        return this.exportSingleValue(
          this.getBlobContentAsString(this.vm.getString(handle)),
          undefined
        );
      });

      exportCtxFunction('getDownloadedBlobContentHandle', (handle) => {
        return this.exportSingleValue(
          this.getDownloadedBlobContentHandle(this.vm.getString(handle)),
          undefined
        );
      });

      exportCtxFunction('getOnDemandBlobContentHandle', (handle) => {
        return this.exportSingleValue(
          this.getOnDemandBlobContentHandle(this.vm.getString(handle)),
          undefined
        );
      });

      this.vm.setProp(this.vm.global, 'cfgRenderCtx', configCtx);
    });
  }
}
