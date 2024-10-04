import {} from './global';
import { getPlatformaInstance } from './internal';
import { Platforma } from './platforma';

export function getRawPlatformaInstance(): Platforma {
  return getPlatformaInstance();
}
