import { assertNever, MiLogger } from '@milaboratories/ts-helpers';
import { downloadBinary } from './pl_binary_download';
import { getDefaultPlVersion } from './pl_version';

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

export function getDefaultPlBinarySource(): PlBinarySourceDownload {
  return { type: 'Download', version: getDefaultPlVersion() };
}

export async function resolvePlBinaryPath(
  logger: MiLogger,
  downloadDir: string,
  src: PlBinarySource
): Promise<string> {
  switch (src.type) {
    case 'Download':
      return await downloadBinary(logger, downloadDir, src.version);

    case 'Local':
      return src.path;

    default:
      assertNever(src);
  }
}
