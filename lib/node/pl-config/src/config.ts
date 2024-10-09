import { MiLogger } from '@milaboratories/ts-helpers';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';
import { MiddleLayerOpsConstructor } from '@milaboratories/pl-middle-layer';
import { Endpoints, getPorts, PlConfigPorts, withLocalhost } from './ports';
import { PlConfig, PlLogLevel } from './types';
import {
  getLicense,
  License,
  licenseEnvsForMixcr,
  licenseForConfig,
  PlLicenseMode
} from './license';
import { createHtpasswdFile } from './auth';
import { createDefaultLocalStorages, StoragesSettings } from './storages';
import { getPlVersion } from './package';
import { createDefaultPackageSettings } from './packageloader';

export type PlConfigOptions = {
  /** Logger for Middle-Layer */
  logger: MiLogger;
  /** Working dir for a local platforma. */
  workingDir: string;
  /** How to choose ports for platforma. */
  portsMode: PlConfigPorts;
  /** How to get license. */
  licenseMode: PlLicenseMode;
  /**
   * A hook that allows to override any default configuration.
   * Check the docs of platforma configuration for the specific fields.
   *
   * @param config - a parsed yaml.
   */
  extraPlConfig?: (config: PlConfig) => PlConfig;
};

export type PlLocalConfigs = {
  /** Working directory for a local platforma. */
  workingDir: string;
  /** Configuration for a local platforma. */
  plLocal: string;
  /** Configuration for middle layer. */
  ml: MiddleLayerOpsConstructor;
  /** Configuration for pl-client. */
  clientAddr: string;
  user: string;
  password: string;
  /** Version of the local platforma. */
  plVersion: string;
};

export async function createDefaultLocalConfigs(opts: PlConfigOptions): Promise<PlLocalConfigs> {
  const user = 'default-user';
  const password = 'default-password';
  const ports = withLocalhost(await getPorts(opts.portsMode));

  const storages = await createDefaultLocalStorages(opts.workingDir);

  // TODO: do we need this in a local deployment?
  const blobDownloadPath = path.join(opts.workingDir, 'drivers', 'blobs');
  await fs.mkdir(blobDownloadPath, { recursive: true });

  const frontendDownloadPath = path.join(opts.workingDir, 'drivers', 'frontend');
  await fs.mkdir(frontendDownloadPath, { recursive: true });

  return {
    workingDir: opts.workingDir,
    plVersion: await getPlVersion(),
    clientAddr: ports.grpc,
    user,
    password,
    plLocal: await createDefaultPlLocalConfig(opts, ports, user, password, storages),
    ml: {
      logger: opts.logger,
      localSecret: 'secret', // @TODO: what to do with this?
      blobDownloadPath,
      frontendDownloadPath,
      platformLocalStorageNameToPath: {
        root: storages.root
      },
      localStorageNameToPath: {}
    }
  };
}

async function createDefaultPlLocalConfig(
  opts: PlConfigOptions,
  ports: Endpoints,
  user: string,
  password: string,
  storages: StoragesSettings
): Promise<string> {
  const license = await getLicense(opts.licenseMode);
  const htpasswdAuth = await createHtpasswdFile(opts.workingDir, [{ user, password }]);

  const packageLoaderPath = await createDefaultPackageSettings(opts.workingDir);

  let config = getPlConfig(opts, ports, license, htpasswdAuth, packageLoaderPath, storages);

  if (opts.extraPlConfig) config = opts.extraPlConfig(config);

  return yaml.stringify(config);
}

function getPlConfig(
  opts: PlConfigOptions,
  ports: Endpoints,
  license: License,
  htpasswdAuth: string,
  packageLoaderPath: string,
  storages: StoragesSettings
): PlConfig {
  const dbPath = 'db';
  const logPath = 'platforma.log';

  return {
    license: licenseForConfig(license),
    logging: {
      level: 'info',
      destinations: [{ path: logPath }]
    },
    monitoring: {
      enabled: true,
      listen: ports.monitoring
    },
    debug: {
      enabled: true,
      listen: ports.debug
    },
    core: {
      logging: {
        extendedInfo: true,
        dumpResourceData: true
      },
      grpc: {
        listen: ports.grpc,
        tls: { enabled: false }
      },
      authEnabled: true,
      auth: [
        {
          driver: 'htpasswd',
          path: htpasswdAuth
        }
      ],
      db: { path: dbPath }
    },
    controllers: {
      workflows: {},
      packageLoader: {
        packagesRoot: packageLoaderPath
      },
      runner: {
        type: 'local',
        storageRoot: storages.runner,
        secrets: [{ map: licenseEnvsForMixcr(license) }]
      },
      data: {
        main: {
          storages: Object.fromEntries(storages.storages.map((s) => [s.storage.id, s.main]))
        },
        storages: storages.storages.map((s) => s.storage)
      }
    }
  };
}
