import type { ComputableCtx } from '@milaboratories/computable';
import {
  JsRenderInternal,
} from '@platforma-sdk/model';
import { notEmpty } from '@milaboratories/ts-helpers';
import { randomUUID } from 'node:crypto';
import type { QuickJSContext, QuickJSHandle } from 'quickjs-emscripten';
import { Scope, errors } from 'quickjs-emscripten';
import type { BlockContextAny } from '../middle_layer/block_ctx';
import type { MiddleLayerEnvironment } from '../middle_layer/middle_layer';
import { stringifyWithResourceId } from '@milaboratories/pl-client';
import { PlQuickJSError } from '@milaboratories/pl-errors';
import { ComputableContextHelper } from './computable_context';

export type DeadlineSettings = {
  currentExecutionTarget: string;
  deadline: number;
};

/**
 * Communicates a deadline to the quickjs runtime, that if passed, will interrupt the execution.
 * Undefined can be used to reset the deadline.
 * */
export type DeadlineSetter = (settings: DeadlineSettings | undefined) => void;

function isArrayBufferOrView(obj: unknown): obj is ArrayBufferLike {
  return obj instanceof ArrayBuffer || ArrayBuffer.isView(obj);
}

/**
 * Contains references to objects needed to execute lambda within computable,
 * providing access to:
 *  - block context
 *  - computable context
 *  - middle layer environment
 * */
export type ComputableEnv = {
  readonly blockCtx: BlockContextAny;
  readonly mlEnv: MiddleLayerEnvironment;
  computableCtx: ComputableCtx;
};

export class JsExecutionContext {
  private readonly callbackRegistry: QuickJSHandle;
  private readonly fnJSONStringify: QuickJSHandle;
  private readonly fnJSONParse: QuickJSHandle;

  public readonly errorRepo = new ErrorRepository();

  public readonly computableHelper: ComputableContextHelper | undefined;

  constructor(
    public readonly scope: Scope,
    public readonly vm: QuickJSContext,
    private readonly deadlineSetter: DeadlineSetter,
    computableEnv?: ComputableEnv,
  ) {
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

    if (computableEnv !== undefined)
      this.computableHelper = new ComputableContextHelper(this, computableEnv.blockCtx, computableEnv.mlEnv, computableEnv.computableCtx);

    this.injectCtx();
  }

  public resetComputableCtx() {
    notEmpty(this.computableHelper, 'Computable context helper is not initialized').resetComputableCtx();
  }

  private static cleanErrorContext(error: unknown): void {
    if (typeof error === 'object' && error !== null && 'context' in error) delete error['context'];
  }

  // private static cleanError(error: unknown): unknown {
  //   if (error instanceof errors.QuickJSUnwrapError) {
  //     const { cause, context: _, name, message, stack, ...rest } = error;
  //     const clean = new errors.QuickJSUnwrapError(cause);
  //     Object.assign(clean, { ...rest, name, message, stack });
  //     return clean;
  //   }
  //   return error;
  // }

  public evaluateBundle(code: string) {
    try {
      this.deadlineSetter({ currentExecutionTarget: 'evaluateBundle', deadline: Date.now() + 10000 });
      this.vm.unwrapResult(this.vm.evalCode(code, 'bundle.js', { type: 'global' })).dispose();
    } catch (err: unknown) {
      JsExecutionContext.cleanErrorContext(err);
      throw err;
    } finally {
      this.deadlineSetter(undefined);
    }
  }

  public runCallback(cbName: string, ...args: unknown[]): QuickJSHandle {
    try {
      this.deadlineSetter({ currentExecutionTarget: cbName, deadline: Date.now() + 10000 });
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
    } finally {
      this.deadlineSetter(undefined);
    }
  }

  //
  // QuickJS Helpers
  //

  public exportSingleValue(
    obj: boolean | number | string | null | ArrayBuffer | undefined,
    scope: Scope | undefined,
  ): QuickJSHandle {
    const result = this.tryExportSingleValue(obj, scope);
    if (result === undefined) {
      throw new Error(`Can't export value: ${obj === undefined ? 'undefined' : JSON.stringify(obj)}`);
    }
    return result;
  }

  public tryExportSingleValue(obj: unknown, scope: Scope | undefined): QuickJSHandle | undefined {
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

  public importObjectUniversal(handle: QuickJSHandle | undefined): unknown {
    if (handle === undefined) return undefined;
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

      //
      // Core props
      //

      this.vm.setProp(configCtx, 'callbackRegistry', this.callbackRegistry);
      this.vm.setProp(
        configCtx,
        'featureFlags',
        this.exportObjectUniversal(JsRenderInternal.GlobalCfgRenderCtxFeatureFlags, localScope),
      );

      //
      // Injecting computable context helper methods if we are running in computable context
      //

      if (this.computableHelper !== undefined)
        this.computableHelper.injectCtx(configCtx);

      //
      // Creating global variable inside the vm
      //

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
