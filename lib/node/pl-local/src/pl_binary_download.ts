import os from 'os';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { request } from 'undici';
import { Writable, Readable } from 'stream';
import { text } from 'stream/consumers';
import * as tar from 'tar';
import { assertNever, fileExists, MiLogger } from '@milaboratories/ts-helpers';
import decompress from 'decompress';

export async function downloadBinary(
  logger: MiLogger,
  baseDir: string,
  plVersion: string
): Promise<string> {
  const { archiveUrl, archivePath, archiveType, targetFolder, binaryPath } = prepareOptions(
    plVersion, baseDir, archiveArch(), archiveOS(),
  );
  await downloadArchive(logger, archiveUrl, archivePath);
  await extractArchive(logger, archivePath, archiveType, targetFolder);

  return binaryPath;
}

function prepareOptions(plVersion: string, baseDir: string, arch: ArchType, os: OSType) {
  const baseName = `pl-${plVersion}-${arch}`;
  const archiveType = osToArchiveType[os];

  const archiveFileName = `${baseName}.${archiveType}`;
  const archiveUrl = `https://cdn.platforma.bio/software/pl/${os}/${archiveFileName}`;
  const archivePath = path.join(baseDir, archiveFileName);

  // folder where binary distribution of pl will be unpacked
  const targetFolder = path.join(baseDir, baseName);

  const binaryPath = path.join(targetFolder, 'binaries', osToBinaryName[os]);

  return {
    archiveUrl,
    archivePath,
    archiveType,
    targetFolder,
    binaryPath
  };
}

export async function downloadArchive(logger: MiLogger, archiveUrl: string, dstArchiveFile: string) {
  if (await fileExists(dstArchiveFile)) {
    logger.info(`Platforma Backend archive download skipped: '${dstArchiveFile}' already exists`);
    return dstArchiveFile;
  }

  await fsp.mkdir(path.dirname(dstArchiveFile), { recursive: true });

  logger.info(`Downloading Platforma Backend archive:\n  URL: ${archiveUrl}\n Save to: ${dstArchiveFile}`);

  const { body, statusCode } = await request(archiveUrl);
  if (statusCode != 200) {
    // completely draining the stream to prevent leaving open connections
    const textBody = await text(body);
    const msg = `failed to download archive: ${statusCode}, response: ${textBody.slice(0, 1000)}`;
    logger.error(msg);
    throw new Error(msg);
  }

  // to prevent incomplete downloads we first write in a temp file
  const tmpPath = dstArchiveFile + '.tmp';
  await Readable.toWeb(body).pipeTo(Writable.toWeb(fs.createWriteStream(tmpPath)));

  // and then atomically rename it
  await fsp.rename(tmpPath, dstArchiveFile);
}

/** Used to prevent mid-way interrupted unarchived folders to be used */
const MarkerFileName = '.ok';

export async function extractArchive(
  logger: MiLogger,
  archivePath: string,
  archiveType: ArchiveType,
  dstFolder: string
) {
  logger.info('extracting archive...');
  logger.info(`  archive path: '${archivePath}'`);
  logger.info(`  target dir: '${dstFolder}'`);

  if (!(await fileExists(archivePath))) {
    const msg = `Platforma Backend binary archive not found at '${archivePath}'`;
    logger.error(msg);
    throw new Error(msg);
  }

  const markerFilePath = path.join(dstFolder, MarkerFileName);

  if (await fileExists(markerFilePath)) {
    logger.info(`Platforma Backend binaries unpack skipped: '${dstFolder}' exists`);
    return;
  }

  if (await fileExists(dstFolder)) {
    logger.info(`Removing previous incompletely unpacked folder: '${dstFolder}'`);
    await fsp.rm(dstFolder, { recursive: true });
  }

  logger.info(`  creating target dir '${dstFolder}'`);
  await fsp.mkdir(dstFolder, { recursive: true });

  logger.info(
    `Unpacking Platforma Backend archive:\n  Archive:   ${archivePath}\n  Target dir: ${dstFolder}`
  );

  switch (archiveType) {
    case 'tgz':
      await tar.x({
        file: archivePath,
        cwd: dstFolder,
        gzip: true
      });
      break;

    case 'zip':
      await decompress(archivePath, dstFolder);
      break;

    default:
      assertNever(archiveType);
  }

  // writing marker file, to be able in the future detect that we completely unarchived the tar file
  await fsp.writeFile(markerFilePath, 'ok');

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

export type ArchiveType = 'tgz' | 'zip';

const osToArchiveType: Record<OSType, ArchiveType> = {
  linux: 'tgz',
  macos: 'tgz',
  windows: 'zip'
}

const osToBinaryName: Record<OSType, string> = {
  linux: 'platforma',
  macos: 'platforma',
  windows: 'platforma.exe'
}
