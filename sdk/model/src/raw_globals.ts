import {} from './global';
import { getPlatformaInstance } from './internal';
import type { Platforma } from './platforma';
import { PlatformaSDKVersion } from './version';

export function getRawPlatformaInstance(): Platforma {
  return getPlatformaInstance({ sdkVersion: PlatformaSDKVersion });
}
