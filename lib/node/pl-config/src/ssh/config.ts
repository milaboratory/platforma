import upath from 'upath';
import yaml from 'yaml';
import type { PlConfigPortsCustomWithMinio } from '../common/ports';
import { getLocalhostEndpoints } from '../common/ports';
import type { PlConfig } from '../common/types';
import type {
  PlLicenseMode,
} from '../common/license';
import {
  getLicenseValue,
} from '../common/license';
import { newHtpasswdFile } from '../common/auth';
import type { StoragesSettings } from '../common/storages';
import { newRemoteConfigStoragesFS, newRemoteConfigStoragesMinio } from '../common/storages';
import { packageLoaderConfig } from '../common/packageloader';
import * as crypto from 'node:crypto';
import { newDefaultPlConfig } from '../common/config';
import type { MiLogger } from '@milaboratories/ts-helpers';

export type SshPlConfigGeneratorOptions = {
  /** Logger for Middle-Layer */
  logger: MiLogger;

  /** Working dir for ssh platforma on the remote server. */
  workingDir: string;

  /** How to choose ports for platforma. */
  portsMode: PlConfigPortsCustomWithMinio;
  /** How to get license. */
  licenseMode: PlLicenseMode;

  /** Should binary registries be overridden. */
  useGlobalAccess: boolean;

  /** Should we use S3 for storage. */
  useMinio: boolean;

  /**
   * A hook that allows to override any default configuration.
   * Check the docs of platforma configuration for the specific fields.
   *
   * @param config - a parsed yaml.
   */
  plConfigPostprocessing?: (config: PlConfig) => PlConfig;
};

export type SshPlConfigGenerationResult = {
  //
  // Pl Instance data
  //

  /** Working directory for a ssh platforma */
  workingDir: string;

  /** Files that needs to be created in the working directory on the remote server
   * along with their content,
   * e.g. Platforma config, users.httpasswd etc. */
  filesToCreate: Record<string, string>;
  dirsToCreate: string[];

  /** These configs need to be passed to pl-deployments. */
  plConfig: SshPlConfig;
  minioConfig: MinioConfig;

  //
  // Data for pl client configuration
  //

  /** Address to connect client to */
  plAddress: string;
  /** Authorization credentials: user */
  plUser: string;
  /** Authorization credentials: password */
  plPassword: string;
};

export type SshPlConfig = {
  configPath: string;
};

export type MinioConfig = {
  envs: Record<string, string>;
  storageDir: string;
};

/**
 * Generates config for Platforma and Minio sitting on SSH.
 *
 * Note:
 * This function will be called each time we need to regenerate a config,
 * i.e. platforma has failed or we intentionally stopped it.
 * So we have to regenerate secrets less often than in local deployment,
 * and thus generating them each time shouldn't be a problem.
 * If we need reproducibility, consider generate them by seed
 * for not to introduce local storage by local_fs_kv_storage.
 */
export async function generateSshPlConfigs(
  opts: SshPlConfigGeneratorOptions,
): Promise<SshPlConfigGenerationResult> {
  const plUser = 'default-user';
  const plPassword = crypto.randomBytes(16).toString('hex');
  const plJwt = crypto.randomBytes(32).toString('hex');

  const minioUser = 'minio-user';
  const bucketName = 'main-bucket';
  const minioPassword = crypto.randomBytes(16).toString('hex');

  const endpoints = await getLocalhostEndpoints(opts.portsMode);

  let storages: StoragesSettings;
  if (opts.useMinio) {
    storages = newRemoteConfigStoragesMinio(opts.workingDir, {
      endpoint: 'http://' + endpoints.minio!,
      presignEndpoint: 'http://' + endpoints.minioLocal!,
      key: minioUser,
      secret: minioPassword,
      bucketName,
    });
  } else {
    storages = newRemoteConfigStoragesFS(opts.workingDir, opts.portsMode.ports.httpLocal);
  }

  const license = await getLicenseValue(opts.licenseMode);
  const htpasswd = newHtpasswdFile(opts.workingDir, [{ user: plUser, password: plPassword }]);
  const packageLoader = packageLoaderConfig(opts.workingDir, opts.useGlobalAccess);

  const configPath = upath.join(opts.workingDir, 'config.yaml');
  let config = newDefaultPlConfig(endpoints, license, htpasswd.filePath, plJwt, packageLoader, storages);
  if (opts.plConfigPostprocessing)
    config = opts.plConfigPostprocessing(config);

  const filesToCreate: Record<string, string> = {};
  filesToCreate[configPath] = yaml.stringify(config);
  filesToCreate[htpasswd.filePath] = htpasswd.content;

  return {
    workingDir: opts.workingDir,
    filesToCreate,
    dirsToCreate: storages.dirsToCreate.concat([packageLoader.packagesRoot]),
    plConfig: { configPath },
    minioConfig: newMinioConfig(minioUser, minioPassword, storages.mainStoragePath, endpoints.minio!, endpoints.minioConsole!),

    plAddress: 'http://' + endpoints.grpcLocal!,
    plUser: plUser,
    plPassword: plPassword,
  };
}

function newMinioConfig(
  user: string, password: string,
  storageDir: string,
  minioAddress: string, minioConsoleAddress: string,
): MinioConfig {
  return {
    envs: {
      MINIO_ROOT_USER: user,
      MINIO_ROOT_PASSWORD: password,
      MINIO_ADDRESS: minioAddress,
      MINIO_CONSOLE_ADDRESS: minioConsoleAddress,
    },
    storageDir: storageDir,
  };
}
