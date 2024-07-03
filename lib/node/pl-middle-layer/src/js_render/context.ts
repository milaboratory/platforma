import { BlockContextAny } from '../middle_layer/block_ctx';
import { QuickJSContext, Scope } from 'quickjs-emscripten';
import { QuickJSHandle } from 'quickjs-emscripten-core';
import { PlTreeNodeAccessor } from '@milaboratory/pl-tree';
import { ComputableCtx } from '@milaboratory/computable';
import { unknown } from 'zod';
import { errorUtil } from 'zod/lib/helpers/errorUtil';
import errToObj = errorUtil.errToObj;
import { randomUUID } from 'node:crypto';

export class JsExecutionContext {
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

  private exportObject(obj: unknown): QuickJSHandle {
    return this.vm.newString(JSON.stringify(obj))
      .consume(json =>
        this.vm.unwrapResult(this.vm.callFunction(this.fnJSONParse, this.vm.undefined, json))
      );
  }

  private importObject(handle: QuickJSHandle): unknown {
    return JSON.parse(
      this.vm.unwrapResult(this.vm.callFunction(
        this.fnJSONStringify, this.vm.undefined, handle))
        .consume(strHandle => this.vm.getString(strHandle))
    );
  }

  public runCallback(cbName: string, ...args: unknown[]): unknown {
    return Scope.withScope(localScope => {
      const targetCallback = localScope.manage(
        this.vm.getProp(this.callbackRegistry, cbName));

      if (this.vm.typeof(targetCallback) !== 'function')
        throw new Error(`No such callback: ${cbName}`);

      return this.vm.unwrapResult(this.vm.callFunction(targetCallback, this.vm.undefined,
        ...args.map(arg => localScope.manage(this.exportObject(arg)))))
        .consume(result => this.importObject(result));
    });
  }

  private injectCtx() {
    Scope.withScope(localScope => {
      const configCtx = localScope.manage(this.vm.newObject());

      this.vm.setProp(configCtx, 'args', localScope.manage(this.vm.newString(this.blockCtx.args)));
      if (this.blockCtx.uiState !== undefined)
        this.vm.setProp(configCtx, 'uiState', localScope.manage(this.vm.newString(this.blockCtx.args)));

      const getAccessorHandleByName = localScope.manage(
        this.vm.newFunction('getAccessorHandleByName', (...args) => {
          if (this.computableCtx === undefined)
            throw new Error('Accessors can\'t be used in this context');
          const name = this.vm.getString(args[0]);
          const wellKnownAccessor = (name: string, ctxKey: 'staging' | 'prod'): QuickJSHandle => {
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
            return this.accessors.get(name) ? this.vm.newString(name) : this.vm.undefined;
          };
          if (name === 'staging')
            return wellKnownAccessor('staging', 'staging');
          else if (name === 'main')
            return wellKnownAccessor('main', 'prod');
          return undefined;
        }));

      const resolveField = localScope.manage(
        this.vm.newFunction('resolveField', (...args) => {
          const accessorId = this.vm.getString(args[0]);
          const field = this.vm.getString(args[1]);
          const accessor = this.accessors.get(accessorId);
          if (accessor === undefined)
            throw new Error('No such accessor');
          const newAccessor = accessor.traverse(field);
          if (newAccessor === undefined)
            return this.vm.undefined;
          else {
            const accessorId = randomUUID();
            this.accessors.set(accessorId, newAccessor);
            return this.vm.newString(accessorId);
          }
        }));

      const getResourceValueAsString = localScope.manage(
        this.vm.newFunction('getResourceValueAsString', (...args) => {
          const accessorId = this.vm.getString(args[0]);
          const accessor = this.accessors.get(accessorId);
          if (accessor === undefined)
            throw new Error('No such accessor');
          const value = accessor.getDataAsString();
          return value === undefined ? this.vm.undefined : this.vm.newString(value);
        }));

      this.vm.setProp(configCtx, 'callbackRegistry', this.callbackRegistry);

      this.vm.setProp(configCtx, 'getAccessorHandleByName', getAccessorHandleByName);
      this.vm.setProp(configCtx, 'resolveField', resolveField);
      this.vm.setProp(configCtx, 'getResourceValueAsString', getResourceValueAsString);

      this.vm.setProp(this.vm.global, 'cfgRenderCtx', configCtx);
    });
  }
}
