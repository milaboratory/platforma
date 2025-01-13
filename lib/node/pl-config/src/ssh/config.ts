import type { MiLogger } from '@milaboratories/ts-helpers';
import path from 'path';
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
import { newRemoteConfigStorages } from '../common/storages';
import { newDefaultPackageSettings } from '../common/packageloader';
import * as crypto from 'node:crypto';
import { newDefaultPlConfig } from '../common/config';

export type SshPlConfigGeneratorOptions = {
  /** Logger for Middle-Layer */
  logger: MiLogger;

  /** Working dir for ssh platforma on the remote server. */
  workingDir: string;

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

  const { minio: minioPort, minioConsole: minioConsolePort } = opts.portsMode.ports;
  const endpoints = await getLocalhostEndpoints(opts.portsMode);

  const storages = newRemoteConfigStorages(opts.workingDir, {
    endpoint: endpoints.minio!,
    presignEndpoint: endpoints.minio!,
    key: minioUser,
    secret: minioPassword,
    bucketName,
  });

  const license = await getLicenseValue(opts.licenseMode);
  const htpasswd = newHtpasswdFile(opts.workingDir, [{ user: plUser, password: plPassword }]);
  const packageLoaderPath = newDefaultPackageSettings(opts.workingDir);

  const configPath = path.join(opts.workingDir, 'config.yaml');
  let config = newDefaultPlConfig(endpoints, license, htpasswd.filePath, plJwt, packageLoaderPath, storages);
  if (opts.plConfigPostprocessing)
    config = opts.plConfigPostprocessing(config);

  const filesToCreate: Record<string, string> = {};
  filesToCreate[configPath] = yaml.stringify(config);
  filesToCreate[htpasswd.filePath] = htpasswd.content;

  return {
    workingDir: opts.workingDir,
    filesToCreate,
    dirsToCreate: storages.dirsToCreate.concat([packageLoaderPath]),
    plConfig: { configPath },
    minioConfig: newMinioConfig(minioUser, minioPassword, storages.mainStoragePath, minioPort, minioConsolePort),

    plAddress: endpoints.grpc,
    plUser: plUser,
    plPassword: plPassword,
  };
}

function newMinioConfig(
  user: string, password: string,
  storageDir: string,
  port: number, consolePort: number,
): MinioConfig {
  return {
    envs: {
      MINIO_ROOT_USER: user,
      MINIO_ROOT_PASSWORD: password,
      MINIO_PORT: String(port),
      MINIO_CONSOLE_PORT: String(consolePort),
    },
    storageDir: storageDir,
  };
}
