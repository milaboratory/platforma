import { Platforma, PlatformaFactory } from './platforma';
import { BlockConfig } from './builder';
import { FutureHandle, GlobalCfgRenderCtx } from './render/internal';

declare global {
  /** Global factory method returning platforma instance */
  const getPlatforma: PlatformaFactory;
  const platforma: Platforma;

  /** Global rendering context, present only in rendering environment */
  const cfgRenderCtx: GlobalCfgRenderCtx;
}

/** Utility code helping to identify whether the code is running in actual UI environment */
export function isInUI() {
  return typeof getPlatforma !== 'undefined' || typeof platforma !== 'undefined';
}

/** Utility code helping to retrieve a platforma instance form the environment */
export function getPlatformaInstance(config: BlockConfig): Platforma {
  if (typeof getPlatforma === 'function')
    return getPlatforma(config);
  else if (typeof platforma !== 'undefined')
    return platforma;
  else
    throw new Error('Can\'t get platforma instance.');
}

export function tryGetCfgRenderCtx(): GlobalCfgRenderCtx | undefined {
  if (typeof cfgRenderCtx !== 'undefined')
    return cfgRenderCtx;
  else
    return undefined;
}

export function getCfgRenderCtx(): GlobalCfgRenderCtx {
  if (typeof cfgRenderCtx !== 'undefined')
    return cfgRenderCtx;
  else
    throw new Error('Not in config rendering context');
}

export function tryRegisterCallback(key: string, callback: (...args: any[]) => any): boolean {
  const ctx = tryGetCfgRenderCtx();
  if (ctx === undefined)
    return false;
  if (key in ctx.callbackRegistry)
    throw new Error(`Callback with key ${key} already registered.`);
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
