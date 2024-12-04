import fs from 'fs';
import path from 'path';
import * as winston from 'winston';
import * as util from './util';
import * as archiver from 'archiver';

const tarArchiveType = 'tgz';
const zipArchiveType = 'zip';
export const allArchiveTypes = [tarArchiveType, zipArchiveType];
export type archiveType = (typeof allArchiveTypes)[number];

export type archiveOptions = {
  packageRoot: string;
  packageName: string;
  packageVersion: string;

  crossplatform: boolean;
  os: util.OSType;
  arch: util.ArchType;
  ext: archiveType;
};

export function getPath(options: archiveOptions): string {
  const packageName = options.packageName.replaceAll('/', '-').replaceAll('\\', '-');

  if (options && !options.crossplatform) {
    return path.resolve(
      options.packageRoot,
      `pkg-${packageName}-${options.packageVersion}-${options.os}-${options.arch}.${options.ext}`
    );
  }

  return path.resolve(
    options.packageRoot,
    `pkg-${packageName}-${options.packageVersion}.${options.ext}`
  );
}

export async function create(
  logger: winston.Logger,
  contentRoot: string,
  dstArchivePath: string
): Promise<void> {
  const compressionLevel = 9;

  var format = '';
  if (dstArchivePath.endsWith('.tgz') || dstArchivePath.endsWith('.tar.gz')) {
    format = 'tar';
  }
  if (dstArchivePath.endsWith('.zip')) {
    format = 'zip';
  }

  if (format == '') {
    throw new Error(
      `Archive ${dstArchivePath} has unsupported extension. Cannot create archive of unknown format`
    );
  }

  const output = fs.createWriteStream(dstArchivePath);
  const a = archiver.create(format, {
    gzip: true,
    gzipOptions: { level: compressionLevel },
    zlib: { level: compressionLevel }
  });

  return new Promise((resolve, reject) => {
    // Waits for the output stream to be closed.
    output.on('close', function () {
      logger.debug(`archive created. Total data processed: ${a.pointer()} bytes`);
      resolve();
    });

    // Catch errors
    a.on('error', function (err) {
      reject(err);
    });

    // Pipe archive data to the file
    a.pipe(output);

    // Append files from sourceDir without prefix
    a.directory(contentRoot, false);

    // Finalize the archive (i.e. we are done appending files but streams have to finish yet)
    a.finalize();
  });
}
