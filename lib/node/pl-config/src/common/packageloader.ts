import fs from 'fs/promises';
import upath from 'upath';
import { PlControllerPackageLoaderSettings } from './types';

/** Gets a default software loader path and creates it locally. */
export async function createDefaultLocalPackageSettings(dir: string, useGlobalAccess: boolean): Promise<PlControllerPackageLoaderSettings> {
  const conf = packageLoaderConfig(dir, useGlobalAccess);
  await fs.mkdir(conf.packagesRoot, { recursive: true });

  return conf;
}

export function packageLoaderConfig(dir: string, useGlobalAccess: boolean): PlControllerPackageLoaderSettings {
  const conf: PlControllerPackageLoaderSettings =  {
    packagesRoot: upath.join(dir, 'packages'),
  }

  if (useGlobalAccess) {
    conf.registries = [{
      name: 'platforma-open',
      endpoints: [{
        type: 'url',
        url: "https://bin-ga.pl-open.science",
      }]
    }];
  }

  return conf;
}
