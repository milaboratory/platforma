import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import * as undici from 'undici';
import type winston from 'winston';

import * as util from '../util';

const defaultEnvironmentName = 'default';

export interface BuilderOptions {
  mambaRootPrefix: string; // root directory for all conda data
  logger: winston.Logger;
  micromambaVersion?: string; // use specific version of micromamba
}

export interface MicromambaDownloadOptions {
  platform: util.PlatformType;
  outputPath: string; // output path for the binary

  version?: string; // defalut: latest
}

export interface EnvCreateOptions {
  /** Environment name */
  environmentName?: string;
  /** Prefix where to create the environment */
  environmentPrefix?: string;
  /** Path to the environment specification file */
  specFile: string;
}

export interface EnvExportOptions {
  /** Name of the environment to export */
  environmentName?: string;
  /** Prefix of the environment to export */
  environmentPrefix?: string;
  /** Export in JSON format */
  json?: boolean;
  /** Output file path for the exported specification */
  outputFile?: string;
}

export interface EnvDeleteOptions {
  /** Environment name */
  environmentName?: string;
  /** Prefix where to create the environment */
  environmentPrefix?: string;
}

export class micromamba {
  constructor(
    private readonly logger: winston.Logger,
    private readonly rootPrefix: string,
    private readonly binaryVersion: string = 'latest',
    private readonly binaryPath: string = '',
  ) {
    if (!binaryPath) {
      this.binaryPath = path.join(rootPrefix, 'micromamba');
    }
  }

  public async downloadBinary(): Promise<void> {
    if (fs.existsSync(this.binaryPath)) {
      try {
        await fsp.access(this.binaryPath, fs.constants.X_OK);
        this.logger.debug(`micromamba binary '${this.binaryPath}' exists and executable. Download was skipped`);
        return;
      } catch {
        this.logger.debug(`file exists but is not executable: ${this.binaryPath}. Fixing permissions`);
        await fsp.chmod(this.binaryPath, 0o755);
      }
    }

    await downloadMicromamba(this.logger, {
      platform: util.currentPlatform(),
      outputPath: this.binaryPath,
      version: this.binaryVersion,
    });
  }

  public getVersion(): string {
    return this.execSync(['--version'])!;
  }

  public createEnvironment(opts: EnvCreateOptions): void {
    const { environmentName, environmentPrefix, specFile } = opts;
    this.logger.debug(`Creating conda environment '${environmentName ?? environmentPrefix ?? defaultEnvironmentName}'...`);

    const args = ['env', 'create', '--file', specFile, '--yes'];
    if (environmentPrefix) {
      args.push('--prefix', environmentPrefix);
    } else if (environmentName) {
      args.push('--name', environmentName);
    } else {
      args.push('--name', defaultEnvironmentName);
    }

    this.execSync(args, {
      stdio: 'inherit',
    });
  }

  public exportEnvironment(opts: { environmentName?: string; environmentPrefix?: string; json?: boolean }): string;
  public exportEnvironment(opts: { environmentName?: string; environmentPrefix?: string; json?: boolean; outputFile: string }): void;
  public exportEnvironment(opts: EnvExportOptions): void | string {
    const { environmentName, environmentPrefix, json, outputFile } = opts;
    this.logger.debug(`Exporting conda environment '${environmentName ?? environmentPrefix ?? defaultEnvironmentName}'...`);

    const file = outputFile ? fs.openSync(outputFile, 'w') : 'pipe';

    const args = ['env', 'export'];
    if (environmentPrefix) {
      args.push('--prefix', environmentPrefix);
    } else if (environmentName) {
      args.push('--name', environmentName);
    } else {
      args.push('--name', defaultEnvironmentName);
    }
    if (json) {
      args.push('--json');
    }

    try {
      const envInfo = this.execSync(args, {
        stdio: ['inherit', file, 'inherit'],
      });

      if (!outputFile) {
        return envInfo;
      }
    } catch (error) {
      if (file !== 'pipe') {
        fs.closeSync(file);
      }
      if (outputFile) {
        fs.rmSync(outputFile, { force: true });
      }
      throw error;
    }

    if (file !== 'pipe') {
      fs.closeSync(file);
    }
  }

  public deleteEnvironment(opts: EnvDeleteOptions): void {
    const { environmentName, environmentPrefix } = opts;

    if (environmentPrefix) {
      this.logger.debug(`Deleting conda environment '${environmentName ?? environmentPrefix ?? defaultEnvironmentName}'...`);
      fs.rmSync(environmentPrefix, { recursive: true });
      return;
    }

    const result = this.exportEnvironment({ environmentName, environmentPrefix, json: true });
    const envInfo = JSON.parse(result ?? '{}') as Record<string, unknown>;

    if (envInfo.prefix) {
      this.logger.debug(`Deleting conda environment '${environmentName ?? environmentPrefix ?? defaultEnvironmentName}'...`);
      fs.rmSync(envInfo.prefix as string, { recursive: true });
    } else {
      const errMsg = 'Failed to delete environment: cannot get environment location from micromamba tool';
      this.logger.error(errMsg);
      throw new Error(errMsg);
    }
  }

  // FIXME: IMHO better to have async exec with promises. I just am not skilled enough to implement it fast. :(
  private execSync(args: string[], opts?: SpawnSyncOptions): string | void {
    this.logger.debug(`Executing micromamba: ${this.binaryPath} ${args.join(' ')}`);

    const result = spawnSync(this.binaryPath, args, {
      encoding: 'utf8',
      stdio: 'pipe',
      ...opts,
      env: {
        ...process.env,
        MAMBA_ROOT_PREFIX: this.rootPrefix,
        CONDA_PKGS_DIRS: path.join(this.rootPrefix, 'pkgs'),
        ...opts?.env,
      },
    });

    if (result.error) {
      throw new Error(`Failed to get micromamba version: ${result.error.message}`);
    }

    if (result.status !== 0) {
      const errMsg = `micromamba command failed with status ${result.status}: ${result.stderr?.toString().trim() ?? 'no piped stderr'}`;
      this.logger.error(errMsg);
      throw new Error(errMsg);
    }

    if (!result.stdout) {
      return;
    }

    return result.stdout.toString().trim();
  }
}

/**
 * Downloads micromamba binary for the specified platform and version
 */
export async function downloadMicromamba(
  logger: winston.Logger,
  options: MicromambaDownloadOptions,
): Promise<string> {
  const { version = 'latest', platform, outputPath } = options;

  const targetPlatform = platform ?? util.currentPlatform();
  const binaryPath = outputPath;

  logger.debug(`Downloading micromamba version ${version} for platform ${targetPlatform}`);

  const downloadUrl = (version === 'latest')
    ? `https://github.com/mamba-org/micromamba-releases/releases/latest/download/${micromambaAssetName(targetPlatform)}`
    : `https://github.com/mamba-org/micromamba-releases/releases/download/${version}/${micromambaAssetName(targetPlatform)}`;

  logger.debug(`Download URL: ${downloadUrl}`);

  await downloadFile(logger, downloadUrl, binaryPath);

  logger.debug(`making binary executable: ${binaryPath}`);
  await fsp.chmod(binaryPath, 0o755);

  logger.info(`Micromamba downloaded to: ${binaryPath}`);
  return binaryPath;
}

/**
 * Get correct asset name with micromamba binary for particular platform,
 * as they are available in micromamba-releases repo.
 */
function micromambaAssetName(platform: util.PlatformType): string {
  const { os, arch } = util.splitPlatform(platform);
  switch (os) {
    case 'linux': {
      switch (arch) {
        case 'x64':
          return 'micromamba-linux-64';
        case 'aarch64':
          return 'micromamba-linux-aarch64';
        default:
          util.assertNever(arch);
      }
      break;
    }
    case 'macosx': {
      switch (arch) {
        case 'x64':
          return 'micromamba-osx-64';
        case 'aarch64':
          return 'micromamba-osx-arm64';
        default:
          util.assertNever(arch);
      }
      break;
    }
    case 'windows': {
      switch (arch) {
        case 'x64':
          return 'micromamba-win-64';
        case 'aarch64':
          throw new Error('Micromamba does not support ARM64 on Windows');
        default:
          util.assertNever(arch);
      }
      break;
    }
    default:
      util.assertNever(os);
  }
  throw new Error('calm down linter, this code is unreachable');
}

/**
 * Downloads a file from URL to local path
 */
async function downloadFile(logger: winston.Logger, url: string, outputPath: string): Promise<void> {
  type responseInfo = {
    statusCode: number;
    body: NodeJS.ReadableStream;
    location: string;
  };

  let response: responseInfo;
  const maxRedirects = 5;
  const maxAttempts = 3;

  let redirCount = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    logger.debug(`Trying to download: ${url}`);
    try {
      const requestResult = await undici.request(url, {
        method: 'GET',
      });
      response = {
        statusCode: requestResult.statusCode,
        location: requestResult.headers['location']?.toString() ?? '',
        body: requestResult.body,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to make request: ${errorMessage}`);
    }

    if (response.statusCode === 301 || response.statusCode === 302) {
      if (redirCount >= maxRedirects) {
        throw new Error(`Too many redirects: ${redirCount}, last location: ${response.location}`);
      }

      logger.debug(`Processing redirect. New location: ${response.location}`);
      redirCount++;
      attempt--;
      url = response.location;
      continue;
    }

    if (response.statusCode === 200) {
      break;
    }

    logger.error(`Failed to download: ${response.statusCode}, attempt ${attempt + 1}`);
  }

  if (response!.statusCode !== 200) {
    throw new Error(`Failed to download: last attempt status code: ${response!.statusCode}`);
  }

  const fileStream = fs.createWriteStream(outputPath);

  response!.body.pipe(fileStream);

  return new Promise((resolve, reject) => {
    fileStream.on('finish', () => {
      fileStream.close();
      resolve();
    });

    fileStream.on('error', (err) => {
      fs.unlink(outputPath, () => {}); // Delete the file on error
      reject(err);
    });
  });
}
