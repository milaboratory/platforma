import type { OutputWithStatus } from "@milaboratories/pl-model-common";
import {} from "./global";
import type { Platforma, PlatformaApiVersion } from "./platforma";
import type { FutureHandle, GlobalCfgRenderCtx } from "./render/internal";
import type { ConfigRenderLambda, ConfigRenderLambdaFlags } from "./bconfig";

/** Utility code helping to identify whether the code is running in actual UI environment */
export function isInUI() {
  return (
    typeof globalThis.getPlatforma !== "undefined" || typeof globalThis.platforma !== "undefined"
  );
}

/** Utility code helping to retrieve a platforma instance form the environment */
export function getPlatformaInstance<
  Args = unknown,
  Outputs extends Record<string, OutputWithStatus<unknown>> = Record<
    string,
    OutputWithStatus<unknown>
  >,
  UiState = unknown,
  Href extends `/${string}` = `/${string}`,
>(config?: {
  sdkVersion: string;
  apiVersion: PlatformaApiVersion;
}): Platforma<Args, Outputs, UiState, Href> {
  if (config && typeof globalThis.getPlatforma === "function")
    return globalThis.getPlatforma(config);
  else if (typeof globalThis.platforma !== "undefined")
    return globalThis.platforma as Platforma<Args, Outputs, UiState, Href>;
  else throw new Error("Can't get platforma instance.");
}

export function tryGetCfgRenderCtx(): GlobalCfgRenderCtx | undefined {
  if (typeof globalThis.cfgRenderCtx !== "undefined") return globalThis.cfgRenderCtx;
  else return undefined;
}

export function getCfgRenderCtx(): GlobalCfgRenderCtx {
  if (typeof globalThis.cfgRenderCtx !== "undefined") return globalThis.cfgRenderCtx;
  else throw new Error("Not in config rendering context");
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
export function createAndRegisterRenderLambda<T = unknown>(
  opts: CreateLambdaOptions & {
    lambda: (...args: any[]) => any;
  },
  replace?: boolean,
): ConfigRenderLambda<T> {
  const { handle, lambda, ...flags } = opts;

  if (replace) {
    replaceCallback(handle, lambda);
  } else {
    tryRegisterCallback(handle, lambda);
  }

  return createRenderLambda<T>({ handle, ...flags });
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
