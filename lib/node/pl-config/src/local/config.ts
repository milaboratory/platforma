import type { MiLogger } from '@milaboratories/ts-helpers';
import upath from 'upath';
import yaml from 'yaml';
import type { Endpoints, PlConfigPorts } from '../common/ports';
import { getLocalhostEndpoints } from '../common/ports';
import type { PlConfig } from '../common/types';
import type {
  PlLicenseMode,
} from '../common/license';
import {
  getLicense,
} from '../common/license';
import { createLocalHtpasswdFile } from '../common/auth';
import type { StoragesSettings } from '../common/storages';
import { createDefaultLocalStorages } from '../common/storages';
import { createDefaultLocalPackageSettings } from '../common/packageloader';
import { FSKVStorage } from './fs_kv_storage';
import * as crypto from 'node:crypto';
import { newDefaultPlConfig } from '../common/config';

export type LocalPlConfigGeneratorOptions = {
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

export type LocalPlConfigGenerationResult = {
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

export async function generateLocalPlConfigs(
  opts: LocalPlConfigGeneratorOptions,
): Promise<LocalPlConfigGenerationResult> {
  const workdir = upath.resolve(opts.workingDir);

  // settings that must be persisted between independent generation invocations
  const kv = await FSKVStorage.init(upath.join(workdir, 'gen'));

  const user = 'default-user';
  const password = await kv.getOrCreate('password', () => crypto.randomBytes(16).toString('hex'));
  const jwt = await kv.getOrCreate('jwt', () => crypto.randomBytes(32).toString('hex'));

  const ports = await getLocalhostEndpoints(opts.portsMode);

  const storages = await createDefaultLocalStorages(workdir);

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
  opts: LocalPlConfigGeneratorOptions,
  ports: Endpoints,
  user: string,
  password: string,
  jwtKey: string,
  storages: StoragesSettings,
): Promise<string> {
  const license = await getLicense(opts.licenseMode);
  const htpasswdAuth = await createLocalHtpasswdFile(opts.workingDir, [{ user, password }]);

  const packageLoaderPath = await createDefaultLocalPackageSettings(opts.workingDir);

  let config = newDefaultPlConfig(ports, license, htpasswdAuth, jwtKey, packageLoaderPath, storages);

  if (opts.plConfigPostprocessing) config = opts.plConfigPostprocessing(config);

  return yaml.stringify(config);
}
