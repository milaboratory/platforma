import fs from 'fs';
import fsp from 'fs/promises';
import upath from 'upath';
import { request } from 'undici';
import { Writable, Readable } from 'stream';
import { text } from 'stream/consumers';
import * as tar from 'tar';
import type { MiLogger } from '@milaboratories/ts-helpers';
import { assertNever, fileExists } from '@milaboratories/ts-helpers';
import decompress from 'decompress';
import type { ArchType, OSType } from './os_and_arch';
import { newOs, newArch } from './os_and_arch';

export type DownloadBinaryResult = {
  archiveUrl: string;
  archivePath: string;
  archiveType: ArchiveType;
  targetFolder: string;
  baseName: string;
  binaryPath?: string;
}

export async function downloadBinary(
  logger: MiLogger,
  baseDir: string,
  softwareName: string,
  tgzName: string,
  arch: string,
  platform: string,
): Promise<DownloadBinaryResult> {
  const opts = getPathsForDownload(softwareName, tgzName, baseDir, newArch(arch), newOs(platform));
  const { archiveUrl, archivePath, archiveType, targetFolder, baseName } = opts;

  await downloadArchive(logger, archiveUrl, archivePath);
  await extractArchive(logger, archivePath, archiveType, targetFolder);

  return opts;
}

export async function downloadPlBinaryNoExtract(
  logger: MiLogger,
  baseDir: string,
  plVersion: string,
  arch: string,
  platform: string,
): Promise<DownloadBinaryResult> {
  const opts = localDownloadPlOptions(plVersion, baseDir, newArch(arch), newOs(platform));
  const { archiveUrl, archivePath } = opts;

  await downloadArchive(logger, archiveUrl, archivePath);

  return opts;
}

export async function downloadPlBinary(
  logger: MiLogger,
  baseDir: string,
  plVersion: string,
  arch: string,
  platform: string,
): Promise<DownloadBinaryResult> {
  const opts = localDownloadPlOptions(plVersion, baseDir, newArch(arch), newOs(platform));
  const { archiveUrl, archivePath, archiveType, targetFolder, binaryPath } = opts;

  await downloadArchive(logger, archiveUrl, archivePath);
  await extractArchive(logger, archivePath, archiveType, targetFolder);

  return opts;
}

function getPathsForDownload(
  softwareName: string,
  tgzName: string,
  baseDir: string,
  arch: ArchType,
  os: OSType,
): DownloadBinaryResult {
  const baseName = `${tgzName}-${arch}`;
  const archiveType = osToArchiveType[os];
  const archiveFileName = `${baseName}.${archiveType}`;
  const archiveUrl = `https://cdn.platforma.bio/software/${softwareName}/${os}/${archiveFileName}`;
  const archivePath = upath.join(baseDir, archiveFileName);
  // folder where binary distribution of pl will be unpacked
  const targetFolder = upath.join(baseDir, baseName);

  return {
    archiveUrl,
    archivePath,
    archiveType,
    targetFolder,
    baseName,
  };
}

export function localDownloadPlOptions(
  plVersion: string,
  baseDir: string,
  arch: ArchType,
  os: OSType,
): DownloadBinaryResult {
  const baseName = `pl-${plVersion}-${arch}`;
  const archiveType = osToArchiveType[os];

  const archiveFileName = `${baseName}.${archiveType}`;
  const archiveUrl = `https://cdn.platforma.bio/software/pl/${os}/${archiveFileName}`;
  const archivePath = upath.join(baseDir, archiveFileName);

  // folder where binary distribution of pl will be unpacked
  const targetFolder = upath.join(baseDir, baseName);

  const binaryPath = upath.join(baseName, 'binaries', osToBinaryName[os]);

  return {
    archiveUrl,
    archivePath,
    archiveType,
    targetFolder,
    binaryPath,
    baseName,
  };
}

export type DownloadInfo = {
  dstArchive?: string;
  fileExisted?: boolean;
  dirnameCreated?: boolean;
  statusCode?: number;
  errorMsg?: string;
  tmpPath?: string;
  wroteTmp?: boolean;
  tmpExisted?: boolean;
  renamed?: boolean;
  newExisted?: boolean;
}

export async function downloadArchive(
  logger: MiLogger, archiveUrl: string, dstArchiveFile: string,
): Promise<DownloadInfo> {
  const state: DownloadInfo = {};
  state.dstArchive = dstArchiveFile;

  try {
    state.fileExisted = await fileExists(dstArchiveFile);
    if (state.fileExisted) {
      logger.info(`Platforma Backend archive download skipped: '${dstArchiveFile}' already exists`);
      return state;
    }

    await fsp.mkdir(upath.dirname(dstArchiveFile), { recursive: true });
    state.dirnameCreated = true;

    logger.info(`Downloading Platforma Backend archive:\n  URL: ${archiveUrl}\n Save to: ${dstArchiveFile}`);

    const { body, statusCode } = await request(archiveUrl);
    state.statusCode = statusCode;
    if (statusCode != 200) {
      // completely draining the stream to prevent leaving open connections
      const textBody = await text(body);
      state.errorMsg = `failed to download archive: ${statusCode}, response: ${textBody.slice(0, 1000)}`;
      logger.error(state.errorMsg);
      throw new Error(state.errorMsg);
    }

    // to prevent incomplete downloads we first write in a temp file
    state.tmpPath = dstArchiveFile + '.tmp';
    await Readable.toWeb(body).pipeTo(Writable.toWeb(fs.createWriteStream(state.tmpPath)));
    state.wroteTmp = true;
    state.tmpExisted = await fileExists(state.tmpPath);

    // and then atomically rename it
    await fsp.rename(state.tmpPath, dstArchiveFile);
    state.renamed = true;
    state.newExisted = await fileExists(dstArchiveFile);

    logger.info(`downloadArchive state: ${JSON.stringify(state)}`);
    return state;
  } catch(e: unknown) {
    const msg = `downloadArchive: error ${String(e)} occurred, state: ${JSON.stringify(state)}`
    logger.error(msg);
    throw new Error(msg)
  }
}

/** Used to prevent mid-way interrupted unarchived folders to be used */
const MarkerFileName = '.ok';

export async function extractArchive(
  logger: MiLogger,
  archivePath: string,
  archiveType: ArchiveType,
  dstFolder: string,
) {
  logger.info('extracting archive...');
  logger.info(`  archive path: '${archivePath}'`);
  logger.info(`  target dir: '${dstFolder}'`);

  if (!(await fileExists(archivePath))) {
    const msg = `Platforma Backend binary archive not found at '${archivePath}'`;
    logger.error(msg);
    throw new Error(msg);
  }

  const markerFilePath = upath.join(dstFolder, MarkerFileName);

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
    `Unpacking Platforma Backend archive:\n  Archive:   ${archivePath}\n  Target dir: ${dstFolder}`,
  );

  switch (archiveType) {
    case 'tgz':
      await tar.x({
        file: archivePath,
        cwd: dstFolder,
        gzip: true,
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

export type ArchiveType = 'tgz' | 'zip';

const osToArchiveType: Record<OSType, ArchiveType> = {
  linux: 'tgz',
  macos: 'tgz',
  windows: 'zip',
};

const osToBinaryName: Record<OSType, string> = {
  linux: 'platforma',
  macos: 'platforma',
  windows: 'platforma.exe',
};
