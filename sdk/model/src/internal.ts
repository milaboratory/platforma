import {} from './global';
import type { Platforma } from './platforma';
import type { FutureHandle, GlobalCfgRenderCtx } from './render/internal';

/** Utility code helping to identify whether the code is running in actual UI environment */
export function isInUI() {
  return (
    typeof globalThis.getPlatforma !== 'undefined' || typeof globalThis.platforma !== 'undefined'
  );
}

/** Utility code helping to retrieve a platforma instance form the environment */
export function getPlatformaInstance(config?: { sdkVersion: string }): Platforma {
  if (config && typeof globalThis.getPlatforma === 'function')
    return globalThis.getPlatforma(config);
  else if (typeof globalThis.platforma !== 'undefined') return globalThis.platforma;
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
