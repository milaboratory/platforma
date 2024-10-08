import { MiLogger } from '@milaboratories/ts-helpers';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'yaml';
import { MiddleLayerOps, MiddleLayerOpsConstructor } from '@milaboratories/pl-middle-layer';
import { Endpoints, getPorts, PlConfigPorts, withLocalhost } from './ports';
import { PlConfig, PlLogLevel } from './types';
import { getLicense, licenseEnvsForMixcr, licenseForConfig, PlLicenseMode } from './license';
import { createHtpasswdFile } from './auth';
import { createDefaultLocalStorages, StoragesSettings } from './storages';
import { getPlVersion } from './package';

export const configLocalYaml = 'config-local.yaml';

export function getConfigPath(dir: string) {
  return path.join(dir, configLocalYaml);
}

export function parseConfig(config: string) {
  return yaml.parse(config);
}

export function stringifyConfig(config: any) {
  return yaml.stringify(config);
}

export async function readConfig(configPath: string) {
  return (await fs.readFile(configPath)).toString();
}

export async function writeConfig(logger: MiLogger, configPath: string, config: string) {
  logger.info(`writing configuration '${configPath}'...`);
  await fs.writeFile(configPath, config);
}

export type PlConfigOptions = {
  logger: MiLogger;
  workingDir: string;
  logLevel: PlLogLevel;
  portsMode: PlConfigPorts;
  licenseMode: PlLicenseMode;
};

export type PlLocalConfigs = {
  plLocal: string;
  ml: MiddleLayerOpsConstructor;
  clientAddr: string;
  user: string;
  password: string;
  plVersion: string;
};

export async function getDefaultLocalConfigs(opts: PlConfigOptions): Promise<PlLocalConfigs> {
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
    plVersion: await getPlVersion(),
    clientAddr: ports.grpc,
    user,
    password,
    plLocal: await getDefaultPlLocalConfig(opts, ports, user, password, storages),
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

async function getDefaultPlLocalConfig(
  opts: PlConfigOptions,
  ports: Endpoints,
  user: string,
  password: string,
  storages: StoragesSettings
): Promise<string> {
  const license = await getLicense(opts.licenseMode);
  const htpasswdAuth = await createHtpasswdFile(opts.workingDir, [{ user, password }]);

  const dbPath = 'db';
  const logPath = 'platforma.log';
  const packageLoaderPath = 'packages';
  await fs.mkdir(path.join(opts.workingDir, packageLoaderPath), { recursive: true });

  const config: PlConfig = {
    license: licenseForConfig(license),
    logging: {
      level: opts.logLevel,
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

  return yaml.stringify(config);
}
