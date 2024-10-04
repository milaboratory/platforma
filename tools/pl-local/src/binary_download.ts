import os from 'os';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { request } from 'undici';
import { Writable, Readable } from 'stream';
import { text } from 'stream/consumers';
import * as tar from 'tar';
import { fileExists, MiLogger } from '@milaboratories/ts-helpers';

export function getBinaryOptions(options: {
  version: string;
  saveDir: string;
}): GetBinaryOptions {
  const version = options?.version;
  const extractToDirName = `pl-${version}-${archiveArch()}`;
  const archiveName = `${extractToDirName}.tgz`;
  const extractTo = path.join(options.saveDir, extractToDirName);

  return {
    downloadUrl: `https://cdn.platforma.bio/software/pl/${archiveOS()}/${archiveName}`,
    archivePath: path.join(options.saveDir, archiveName),
    extractTo,
    pathToBinary: path.join(extractTo, "binaries", "platforma")
  }
}

export interface GetBinaryOptions {
  downloadUrl: string;
  archivePath: string;
  extractTo: string;
  pathToBinary: string;
}

export async function getBinary(
  logger: MiLogger,
  options: GetBinaryOptions,
): Promise<string> {
  await downloadArchive(logger, options);
  await extractArchive(logger, options);
  return options.pathToBinary;
}

export async function downloadArchive(
  logger: MiLogger,
  options: GetBinaryOptions
) {
  if (await fileExists(options.archivePath)) {
    logger.info(`Platforma Backend archive download skipped: '${options.archivePath}' already exists`);
    return options.archivePath;
  }

  await fsp.mkdir(path.dirname(options.archivePath), { recursive: true });

  logger.info(`Downloading Platforma Backend archive:\n  URL:     ${options.downloadUrl}\n  Save to: ${options.archivePath}`);

  const { body, statusCode } = await request(options.downloadUrl);
  if (statusCode != 200) {
    const textBody = await text(body);
    throw new Error(`failed to download archive: ${statusCode}, response: ${textBody.slice(0, 1000)}`);
  }

  const archive = Writable.toWeb(fs.createWriteStream(options.archivePath));
  await Readable.toWeb(body).pipeTo(archive);
}

export async function extractArchive(
  logger: MiLogger,
  options: {
    version?: string;
    archivePath: string;
    extractTo: string;
  }
) {
  logger.info('extracting archive...');
  logger.info(`  version: '${options.version}'`);
  logger.info(`  archive path: '${options.archivePath}'`);
  logger.info(`  target dir: '${options.extractTo}'`);

  if (await fileExists(options.extractTo)) {
    logger.info(`Platforma Backend binaries unpack skipped: '${options.extractTo}' exists`);
    return;
  }

  if (!(await fileExists(options.archivePath))) {
    const msg = `Platforma Backend binary archive not found at '${options.archivePath}'`;
    logger.error(msg);
    throw new Error(msg);
  }

  if (!(await fileExists(options.extractTo))) {
    logger.info(`  creating target dir '${options.extractTo}'`);
    await fsp.mkdir(options.extractTo, { recursive: true });
  }

  logger.info(`Unpacking Platforma Backend archive:\n  Archive:   ${options.archivePath}\n  Target dir: ${options.extractTo}`);

  tar.x({
    file: options.archivePath,
    cwd: options.extractTo,
    gzip: true,
    sync: true
  });

  logger.info(`  ... unpack done.`);
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

