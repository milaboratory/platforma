import type { MiLogger } from '@milaboratories/ts-helpers';
import { assertNever } from '@milaboratories/ts-helpers';
import { downloadPlBinary, DownloadBinaryResult } from './pl_binary_download';
import { getDefaultPlVersion } from './pl_version';
import os from 'os';

/** Shows how the binary should be got. */
export type PlBinarySource = PlBinarySourceDownload | PlBinarySourceLocal;

export type PlBinarySourceDownload = {
  readonly type: 'Download';
  readonly version: string;
};

export type PlBinarySourceLocal = {
  readonly type: 'Local';
  readonly path: string;
};

export function newDefaultPlBinarySource(): PlBinarySourceDownload {
  return { type: 'Download', version: getDefaultPlVersion() };
}

export async function resolveLocalPlBinaryPath(
  logger: MiLogger,
  downloadDir: string,
  src: PlBinarySource,
): Promise<string> {
  switch (src.type) {
    case 'Download':
      return (await downloadPlBinary(logger, downloadDir, src.version, os.arch(), os.platform())).binaryPath!;

    case 'Local':
      return src.path;

    default:
      assertNever(src);
  }
}
