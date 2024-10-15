import os from 'os';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { request } from 'undici';
import { Writable, Readable } from 'stream';
import { text } from 'stream/consumers';
import * as tar from 'tar';
import { fileExists, MiLogger } from '@milaboratories/ts-helpers';

export async function downloadBinary(
  logger: MiLogger,
  baseDir: string,
  plVersion: string
): Promise<string> {
  const baseName = `pl-${plVersion}-${archiveArch()}`;

  const tarFileName = `${baseName}.tgz`;

  const tarUrl = `https://cdn.platforma.bio/software/pl/${archiveOS()}/${tarFileName}`;

  const tarFilePath = path.join(baseDir, tarFileName);

  // folder where binary distribution of pl will be unpacked
  const targetFolder = path.join(baseDir, baseName);

  await downloadArchive(logger, tarUrl, tarFilePath);
  await extractArchive(logger, tarFilePath, targetFolder);

  return path.join(targetFolder, 'binaries', 'platforma');
}

export async function downloadArchive(logger: MiLogger, tarUrl: string, dstTarFile: string) {
  if (await fileExists(dstTarFile)) {
    logger.info(`Platforma Backend archive download skipped: '${dstTarFile}' already exists`);
    return dstTarFile;
  }

  await fsp.mkdir(path.dirname(dstTarFile), { recursive: true });

  logger.info(`Downloading Platforma Backend archive:\n  URL: ${tarUrl}\n Save to: ${dstTarFile}`);

  const { body, statusCode } = await request(tarUrl);
  if (statusCode != 200) {
    // completely draining the stream to prevent leaving open connections
    const textBody = await text(body);
    const msg = `failed to download archive: ${statusCode}, response: ${textBody.slice(0, 1000)}`;
    logger.error(msg);
    throw new Error(msg);
  }

  // to prevent incomplete downloads we first write in a temp file
  const tmpPath = dstTarFile + '.tmp';
  await Readable.toWeb(body).pipeTo(Writable.toWeb(fs.createWriteStream(tmpPath)));

  // and then atomically rename it
  await fsp.rename(tmpPath, dstTarFile);
}

/** Used to prevent mid-way interrupted unarchived folders to be used */
const MarkerFileName = '.ok';

export async function extractArchive(logger: MiLogger, tarPath: string, dstFolder: string) {
  logger.info('extracting archive...');
  logger.info(`  archive path: '${tarPath}'`);
  logger.info(`  target dir: '${dstFolder}'`);

  if (!(await fileExists(tarPath))) {
    const msg = `Platforma Backend binary archive not found at '${tarPath}'`;
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
    `Unpacking Platforma Backend archive:\n  Archive:   ${tarPath}\n  Target dir: ${dstFolder}`
  );

  await tar.x({
    file: tarPath,
    cwd: dstFolder,
    gzip: true
  });

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
