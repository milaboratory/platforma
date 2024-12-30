import type { MiLogger } from '@milaboratories/ts-helpers';
import { notEmpty } from '@milaboratories/ts-helpers';
import path from 'path';
import yaml from 'yaml';
import type { Endpoints, PlConfigPortsCustomWithMinio } from './common/ports';
import { getEndpoints, getPorts, PlConfigPorts, withHost } from './common/ports';
import type { PlConfig } from './common/types';
import type {
  License,
  PlLicenseMode,
} from './common/license';
import {
  getLicense,
  licenseEnvsForMixcr,
  licenseForConfig,
} from './common/license';
import { createHtpasswdFile, getDefaultAuthMethods } from './common/auth';
import type { StoragesSettings } from './common/storages';
import { createDefaultLocalStorages, getRemoteConfigStorages as getDefaultRemoteStorages } from './common/storages';
import { createDefaultPackageSettings } from './common/packageloader';
import { FSKVStorage } from './common/fskvstorage';
import * as crypto from 'node:crypto';

/**
   TODO:
   - 127.0.0.1 -> 0.0.0.0
   - root -> remote_root storage
   - minio password and user,
       - probably should be got from remote system?
       - they should be generated only if Pl is not running
       - MINIO_ROOT_USER, MINIO_ROOT_PASSWORD
       - MINIO_PORT, MINIO_CONSOLE_PORT
       - MINIO_ROOT_USER=testuser MINIO_ROOT_PASSWORD=testpassword ./minio server /home/pl-doctor/platforma_backend/storages/main/
       - presignEndpoint!
   - users.htpasswd
 */

export type SshPlConfigGeneratorOptions = {
  /** Logger for Middle-Layer */
  logger: MiLogger;
  /** Working dir for a local platforma. */
  workingDir: string;

  /** The host the client connects to by SSH. */
  host: string;

  /** How to choose ports for platforma. */
  portsMode: PlConfigPortsCustomWithMinio;
  /** How to get license. */
  licenseMode: PlLicenseMode;

  /**
   * A hook that allows to override any default configuration.
   * Check the docs of platforma configuration for the specific fields.
   *
   * @param config - a parsed yaml.
   */
  plConfigPostprocessing?: (config: PlConfig) => PlConfig;
};

/** Defines which storages from pl are available via local paths */
export type LocalStorageProjection = {
  /** Pl storage id */
  readonly storageId: string;

  /**
   * Local path, the storage is mounted at.
   *
   * Empty string means that this storage accepts absolute paths, and operates inside the same OS.
   * This matches the behaviour how pl interprets FS storage config.
   * */
  readonly localPath: string;
};

export type SshPlConfigGenerationResult = {
  //
  // Pl Instance data
  //

  /** Working directory for a local platforma */
  workingDir: string;

  /** Configuration content for a local platforma */
  plConfigContent: string;

  //
  // Data for pl client configuration
  //

  /** Address to connect client to */
  plAddress: string;
  /** Authorization credentials: user */
  plUser: string;
  /** Authorization credentials: password */
  plPassword: string;

  //
  // Data for configuration of blob drivers
  //

  readonly localStorageProjections: LocalStorageProjection[];
};

export async function generateSshPlConfigs(
  opts: SshPlConfigGeneratorOptions,
): Promise<SshPlConfigGenerationResult> {
  const workdir = path.resolve(opts.workingDir);

  // settings that must be persisted between independent generation invocations
  const kv = await FSKVStorage.init(path.join(workdir, 'gen'));

  const user = 'default-user';
  const password = await kv.getOrCreate('password', () => crypto.randomBytes(16).toString('hex'));
  const jwt = await kv.getOrCreate('jwt', () => crypto.randomBytes(32).toString('hex'));

  const ports = await getEndpoints(opts.host, opts.portsMode);

  const storages = getDefaultRemoteStorages(workdir, {
    endpoint: `http://127.0.0.1:${notEmpty(ports.minio)}`,
    presignEndpoint: `http://127.0.0.1:${notEmpty(ports.minio)}`,
    key: 'static:testuser',
    secret: 'static:testpassword',
    bucketName: 'main-bucket',
  });

  return {
    workingDir: opts.workingDir,

    plConfigContent: await createDefaultPlLocalConfig(opts, ports, user, password, jwt, storages),

    plAddress: ports.grpc,
    plUser: user,
    plPassword: password,

    localStorageProjections: storages.storages
      .filter((s) => s.main.downloadable && s.localPath !== undefined)
      .map((s) => ({
        storageId: s.storage.id,
        localPath: s.localPath!,
      })),
  };
}

async function createDefaultPlLocalConfig(
  opts: SshPlConfigGeneratorOptions,
  ports: Endpoints,
  user: string,
  password: string,
  jwtKey: string,
  storages: StoragesSettings,
): Promise<string> {
  const license = await getLicense(opts.licenseMode);
  const htpasswdAuth = await createHtpasswdFile(opts.workingDir, [{ user, password }]);

  const packageLoaderPath = await createDefaultPackageSettings(opts.workingDir);

  let config = getPlConfig(opts, ports, license, htpasswdAuth, jwtKey, packageLoaderPath, storages);

  if (opts.plConfigPostprocessing) config = opts.plConfigPostprocessing(config);

  return yaml.stringify(config);
}

function getPlConfig(
  opts: SshPlConfigGeneratorOptions,
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
