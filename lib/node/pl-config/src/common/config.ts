import { getDefaultAuthMethods } from './auth';
import type { License } from './license';
import { licenseEnvsForMixcr, licenseForConfig } from './license';
import type { Endpoints } from './ports';
import type { StoragesSettings } from './storages';
import type { PlConfig } from './types';

export function newDefaultPlConfig(
  ports: Endpoints,
  license: License,
  htpasswdAuth: string,
  jwtKey: string,
  packageLoaderPath: string,
  storages: StoragesSettings,
): PlConfig {
  const dbPath = 'db';
  const logPath = 'platforma.log';

  return {
    license: licenseForConfig(license),
    logging: {
      level: 'info',
      destinations: [{ path: logPath }],
    },
    monitoring: {
      enabled: true,
      listen: ports.monitoring,
    },
    debug: {
      enabled: true,
      listen: ports.debug,
    },
    core: {
      logging: {
        extendedInfo: true,
        dumpResourceData: true,
      },
      grpc: {
        listen: ports.grpc,
        tls: { enabled: false },
      },
      authEnabled: true,
      auth: getDefaultAuthMethods(htpasswdAuth, jwtKey),
      db: { path: dbPath },
    },
    controllers: {
      workflows: {},
      packageLoader: {
        packagesRoot: packageLoaderPath,
      },
      runner: {
        type: 'local',
        storageRoot: storages.runner,
        workdirCacheOnFailure: '1h',
        secrets: [{ map: licenseEnvsForMixcr(license) }],
      },
      data: {
        main: {
          storages: Object.fromEntries(storages.storages.map((s) => [s.storage.id, s.main])),
        },
        storages: storages.storages.map((s) => s.storage),
      },
    },
  };
}