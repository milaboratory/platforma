import type { OutputWithStatus } from '@milaboratories/pl-model-common';
import { } from './global';
import type { Platforma, PlatformaApiVersion } from './platforma';
import type { FutureHandle, GlobalCfgRenderCtx } from './render/internal';
import type { ConfigRenderLambda, ConfigRenderLambdaFlags } from './bconfig';

/** Utility code helping to identify whether the code is running in actual UI environment */
export function isInUI() {
  return (
    typeof globalThis.getPlatforma !== 'undefined' || typeof globalThis.platforma !== 'undefined'
  );
}

/** Utility code helping to retrieve a platforma instance form the environment */
export function getPlatformaInstance<
  Args = unknown,
  Outputs extends Record<string, OutputWithStatus<unknown>> = Record<string, OutputWithStatus<unknown>>,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
>(config?: { sdkVersion: string; apiVersion: PlatformaApiVersion }): Platforma<Args, Outputs, UiState, Href> {
  if (config && typeof globalThis.getPlatforma === 'function')
    return globalThis.getPlatforma(config);
  else if (typeof globalThis.platforma !== 'undefined') return globalThis.platforma as Platforma<Args, Outputs, UiState, Href>;
  else throw new Error('Can\'t get platforma instance.');
}

export function tryGetCfgRenderCtx(): GlobalCfgRenderCtx | undefined {
  if (typeof globalThis.cfgRenderCtx !== 'undefined') return globalThis.cfgRenderCtx;
  else return undefined;
}

export function getCfgRenderCtx(): GlobalCfgRenderCtx {
  if (typeof globalThis.cfgRenderCtx !== 'undefined') return globalThis.cfgRenderCtx;
  else throw new Error('Not in config rendering context');
}

export function tryRegisterCallback(key: string, callback: (...args: any[]) => any): boolean {
  const ctx = tryGetCfgRenderCtx();
  if (ctx === undefined) return false;
  if (key in ctx.callbackRegistry) throw new Error(`Callback with key ${key} already registered.`);
  ctx.callbackRegistry[key] = callback;
  return true;
}

/**
 * Registers a callback, replacing any existing callback with the same key.
 * Use this for callbacks that have a default value but can be overridden.
 *
 * @param key - The callback registry key
 * @param callback - The callback function to register
 * @returns true if registered, false if not in render context
 */
export function replaceCallback(key: string, callback: (...args: any[]) => any): boolean {
  const ctx = tryGetCfgRenderCtx();
  if (ctx === undefined) return false;
  ctx.callbackRegistry[key] = callback;
  return true;
}

//
// ConfigRenderLambda helpers
//

/** Options for creating a ConfigRenderLambda descriptor */
export type CreateLambdaOptions = ConfigRenderLambdaFlags & {
  /** The callback registry key */
  handle: string;
};

/** Creates a ConfigRenderLambda descriptor without registering a callback. */
export function createRenderLambda<T = unknown>(opts: CreateLambdaOptions): ConfigRenderLambda<T> {
  const { handle, ...flags } = opts;
  return {
    __renderLambda: true,
    handle,
    ...flags,
  } as ConfigRenderLambda<T>;
}

/** Registers a callback and returns a ConfigRenderLambda descriptor. */
export function createAndRegisterRenderLambda<T = unknown>(opts: CreateLambdaOptions & {
  lambda: (...args: any[]) => any;
}, replace?: boolean): ConfigRenderLambda<T> {
  const { handle, lambda, ...flags } = opts;

  if (replace) {
    replaceCallback(handle, lambda);
  } else {
    tryRegisterCallback(handle, lambda);
  }

  return createRenderLambda<T>({ handle, ...flags });
}

/**
 * Symbol used to store the callbacks array on the dispatcher function.
 * This allows us to append new callbacks to an existing array-based callback.
 */
const CALLBACKS_ARRAY_SYMBOL = Symbol.for('__pl_callbacks_array__');

/**
 * Appends a callback to an array stored under the given key.
 * Creates a dispatcher function on first call that routes to callbacks by index.
 *
 * @param key - The callback registry key
 * @param callback - The callback function to append
 * @returns The index of the appended callback, or undefined if not in render context
 *
 * @example
 * // In builder:
 * const index = tryAppendCallback('migrations', fn);
 *
 * // In middle layer - call specific migration:
 * const result = rCtx.runCallback('migrations', migrationIndex, state);
 */
export function tryAppendCallback(key: string, callback: (...args: any[]) => any): number | undefined {
  const ctx = tryGetCfgRenderCtx();
  if (ctx === undefined) return undefined;

  if (!(key in ctx.callbackRegistry)) {
    // First callback - create dispatcher and callbacks array
    const callbacks: Array<(...args: any[]) => any> = [callback];

    // Dispatcher that calls the right function by index
    const dispatcher = (index: number, ...args: any[]) => {
      if (index < 0 || index >= callbacks.length) {
        throw new Error(`Invalid callback index ${index} for key ${key}. Available: 0-${callbacks.length - 1}`);
      }
      return callbacks[index](...args);
    };

    // Store callbacks array on the dispatcher for later appending
    (dispatcher as any)[CALLBACKS_ARRAY_SYMBOL] = callbacks;

    ctx.callbackRegistry[key] = dispatcher;
    return 0;
  }

  // Key exists - verify it's an array-based callback and append
  const dispatcher = ctx.callbackRegistry[key];
  const callbacks = (dispatcher as any)[CALLBACKS_ARRAY_SYMBOL] as Array<(...args: any[]) => any> | undefined;

  if (callbacks === undefined) {
    throw new Error(`Callback with key ${key} exists but is not an array-based callback. Use tryRegisterCallback for single callbacks.`);
  }

  callbacks.push(callback);
  return callbacks.length - 1;
}

/**
 * Gets the number of callbacks registered under an array-based callback key.
 *
 * @param key - The callback registry key
 * @returns The number of callbacks, or undefined if key doesn't exist or isn't array-based
 */
export function getCallbackCount(key: string): number | undefined {
  const ctx = tryGetCfgRenderCtx();
  if (ctx === undefined) return undefined;

  if (!(key in ctx.callbackRegistry)) {
    return undefined;
  }

  const dispatcher = ctx.callbackRegistry[key];
  const callbacks = (dispatcher as any)[CALLBACKS_ARRAY_SYMBOL] as Array<(...args: any[]) => any> | undefined;

  return callbacks?.length;
}

const futureResolves = new Map<string, ((value: unknown) => void)[]>();

export function registerFutureAwait(handle: FutureHandle, onResolve: (value: unknown) => void) {
  if (!(handle in getCfgRenderCtx().callbackRegistry)) {
    getCfgRenderCtx().callbackRegistry[handle] = (value: unknown) => {
      for (const res of futureResolves.get(handle)!) {
        res(value);
      }
    };
    futureResolves.set(handle, []);
  }
  futureResolves.get(handle)!.push(onResolve);
}
