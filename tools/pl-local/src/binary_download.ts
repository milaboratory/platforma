import os from 'os';
import fs from 'fs';
import path from 'path';
import { request } from 'undici';
import { Writable, Readable } from 'stream';
import { text } from 'stream/consumers';
import * as tar from 'tar';
import * as pkg from './package';
import { MiLogger } from '@milaboratories/ts-helpers';

export async function getBinary(
  logger: MiLogger,
  options: {
    version: string;
    saveTo: string;
  }
): Promise<string> {
  const archivePath = await downloadArchive(logger, options);
  const targetDir = extractArchive(logger, { archivePath });
  return targetDir;
}

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

export async function downloadArchive(
  logger: MiLogger,
  options: {
    version?: string;
    downloadURL?: string;
    saveTo: string;
  }
): Promise<string> {
  const version = options?.version ?? pkg.getPackageJson()['pl-version'];

  const archiveName = `pl-${version}-${archiveArch()}.tgz`;
  const downloadURL = options?.downloadURL ?? `https://cdn.platforma.bio/software/pl/${archiveOS()}/${archiveName}`;

  const archiveFilePath = options.saveTo;
  if (fs.existsSync(archiveFilePath)) {
    logger.info(`Platforma Backend archive download skipped: '${archiveFilePath}' already exists`);
    return Promise.resolve(archiveFilePath);
  }

  fs.mkdirSync(path.dirname(archiveFilePath), { recursive: true });

  logger.info(`Downloading Platforma Backend archive:\n  URL:     ${downloadURL}\n  Save to: ${archiveFilePath}`);

  const { body, statusCode } = await request(downloadURL);
  if (statusCode != 200) {
    const textBody = await text(body);
    throw new Error(`failed to download archive: ${statusCode}, response: ${textBody.slice(0, 1000)}`);
  }

  const archive = Writable.toWeb(fs.createWriteStream(archiveFilePath));
  await Readable.toWeb(body).pipeTo(archive);

  return archiveFilePath;
}

export function extractArchive(
  logger: winston.Logger,
  options: {
    version?: string;
    archivePath: string;
    extractTo?: string;
  }
): string {
  logger.debug('extracting archive...');

  const version = options?.version ?? pkg.getPackageJson()['pl-version'];
  logger.debug(`  version: '${version}'`);
  const archiveName = `${binaryDirName({ version })}.tgz`;

  const archivePath = options?.archivePath;
  logger.debug(`  archive path: '${archivePath}'`);

  const targetDir = options?.extractTo ?? trimExtension(archivePath);
  logger.debug(`  target dir: '${targetDir}'`);

  if (fs.existsSync(targetDir)) {
    logger.info(`Platforma Backend binaries unpack skipped: '${targetDir}' exists`);
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

  logger.info(`Unpacking Platforma Backend archive:\n  Archive:   ${archivePath}\n  Target dir: ${targetDir}`);

  tar.x({
    file: archivePath,
    cwd: targetDir,
    gzip: true,
    sync: true
  });

  logger.info(`  ... unpack done.`);

  return targetDir;
}

export function binaryDirName(options?: { version?: string }): string {
  const version = options?.version ?? pkg.getPackageJson()['pl-version'];
  return `pl-${version}-${archiveArch()}`;
}

function trimExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return filename;
  }
  return filename.slice(0, lastDotIndex);
}
