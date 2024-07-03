import { Platforma, PlatformaFactory } from './platforma';
import { BlockConfig } from './builder';

declare global {
  /** Global factory method returning platforma instance */
  const getPlatforma: PlatformaFactory;
  const platforma: Platforma;

  /** Global callback registry used in config rendering */
  const callbackRegistry: Record<string, Function>;
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

export function tryRegisterCallback(key: string, callback: (...args: any[]) => any): boolean {
  if (typeof callbackRegistry !== 'undefined') {
    if (key in callbackRegistry)
      throw new Error(`Callback with key ${key} already registered.`);
    callbackRegistry[key] = callback;
    return true;
  } else
    return false;
}
