import { Platforma, PlatformaFactory } from './platforma';
import { BlockConfig } from './builder';

declare global {
  /** Global factory method returning platforma instance */
  const getPlatforma: PlatformaFactory;
  const platforma: Platforma;
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
