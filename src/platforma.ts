import os from 'os';
import fs from 'fs';
import https from 'https';
import * as tar from 'tar';
import winston from 'winston';
import * as pkg from './package';
import path from 'path';

export const OSes = ['linux', 'macos', 'windows'] as const;
export type OSType = (typeof OSes)[number];

export function archiveOS(osName?: string): OSType {
  const platform = osName ?? os.platform();

  switch (platform) {
    case 'darwin':
      return 'macos';
    case 'linux':
      return 'linux';
    case 'win32':
      return 'windows';
    default:
      throw new Error(
        `operating system '${platform}' is not currently supported by Platforma ecosystem. The list of OSes supported: ` +
          JSON.stringify(OSes)
      );
  }
}

export const Arches = ['amd64', 'arm64'] as const;
export type ArchType = (typeof Arches)[number];

export function archiveArch(archName?: string): ArchType {
  const arch = archName ?? os.arch();

  switch (arch) {
    case 'arm64':
      return 'arm64';
    case 'x64':
      return 'amd64';
    default:
      throw new Error(
        `processor architecture '${arch}' is not currently supported by Platforma ecosystem. The list of architectures supported: ` +
          JSON.stringify(Arches)
      );
  }
}

export function downloadArchive(
  logger: winston.Logger,
  options?: {
    version?: string;
    showProgress?: boolean;
    downloadURL?: string;
    saveTo?: string;
  }
): Promise<string> {
  const version = options?.version ?? pkg.getPackageJson()['pl-version'];
  const showProgress = options?.showProgress ?? process.stdout.isTTY;

  const archiveName = `pl-${version}-${archiveArch()}.tgz`;
  const downloadURL =
    options?.downloadURL ??
    `https://cdn.platforma.bio/software/pl/${archiveOS()}/${archiveName}`;

  const archiveFilePath = options?.saveTo ?? pkg.binaries(archiveName);
  if (fs.existsSync(archiveFilePath)) {
    logger.info(
      `Platforma Backend archive download skipped: '${archiveFilePath}' already exists`
    );
    return Promise.resolve(archiveFilePath);
  }

  fs.mkdirSync(path.dirname(archiveFilePath), { recursive: true });

  logger.info(
    `Downloading Platforma Backend archive:\n  URL:     ${downloadURL}\n  Save to: ${archiveFilePath}`
  );

  const request = https.get(downloadURL);

  return new Promise((resolve, reject) => {
    request.on('response', (response) => {
      if (!response.statusCode) {
        const err = new Error(
          'failed to download archive: no HTTP status code in response from server'
        );
        request.destroy();
        reject(err);
        return;
      }
      if (response.statusCode !== 200) {
        const err = new Error(
          `failed to download archive: ${response.statusCode} ${response.statusMessage}`
        );
        request.destroy();
        reject(err);
        return;
      }

      const totalBytes = parseInt(
        response.headers['content-length'] || '0',
        10
      );
      let downloadedBytes = 0;

      const archive = fs.createWriteStream(archiveFilePath);

      response.pipe(archive);
      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const progress = (downloadedBytes / totalBytes) * 100;
        if (showProgress) {
          process.stdout.write(`  downloading: ${progress.toFixed(2)}%\r`);
        }
      });

      response.on('error', (err: Error) => {
        fs.unlinkSync(archiveFilePath);
        logger.error(`Failed to download Platforma Binary: ${err.message}`);
        request.destroy();
        reject(err);
      });

      archive.on('finish', () => {
        archive.close();
        logger.info(`  ... download done.`);
        request.destroy();
        resolve(archiveFilePath);
      });
    });
  });
}

export function extractArchive(
  logger: winston.Logger,
  options?: {
    version?: string;
    archivePath?: string;
    extractTo?: string;
  }
): string {
  logger.debug('extracting archive...');

  const version = options?.version ?? pkg.getPackageJson()['pl-version'];
  logger.debug(`  version: '${version}'`);
  const archiveName = `${binaryDirName({ version })}.tgz`;

  const archivePath = options?.archivePath ?? pkg.binaries(archiveName);
  logger.debug(`  archive path: '${archivePath}'`);

  const targetDir = options?.extractTo ?? trimExtension(archivePath);
  logger.debug(`  target dir: '${targetDir}'`);

  if (fs.existsSync(targetDir)) {
    logger.info(
      `Platforma Backend binaries unpack skipped: '${targetDir}' exists`
    );
    return targetDir;
  }

  if (!fs.existsSync(archivePath)) {
    const msg = `Platforma Backend binary archive not found at '${archivePath}'`;
    logger.error(msg);
    throw new Error(msg);
  }

  if (!fs.existsSync(targetDir)) {
    logger.debug(`  creating target dir '${targetDir}'`);
    fs.mkdirSync(targetDir, { recursive: true });
  }

  logger.info(
    `Unpacking Platforma Backend archive:\n  Archive:   ${archivePath}\n  Target dir: ${targetDir}`
  );

  tar.x({
    file: archivePath,
    cwd: targetDir,
    gzip: true,
    sync: true
  });

  logger.info(`  ... unpack done.`);

  return targetDir;
}

export function getBinary(
  logger: winston.Logger,
  options?: { version?: string; showProgress?: boolean }
): Promise<string> {
  return downloadArchive(logger, options).then((archivePath) =>
    extractArchive(logger, { archivePath })
  );
}

function binaryDirName(options?: { version?: string }): string {
  const version = options?.version ?? pkg.getPackageJson()['pl-version'];
  return `pl-${version}-${archiveArch()}`;
}

export function binaryPath(version?: string, ...p: string[]): string {
  return pkg.binaries(binaryDirName({ version }), ...p);
}

function trimExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return filename;
  }
  return filename.slice(0, lastDotIndex);
}
