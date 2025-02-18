import type { MiLogger } from '@milaboratories/ts-helpers';
import { assertNever } from '@milaboratories/ts-helpers';
import { downloadBinary } from './pl_binary_download';
import { getDefaultPlVersion } from './pl_version';
import os from 'os';
import upath from 'upath';
import type { OSType } from './os_and_arch';
import { newOs } from './os_and_arch';

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
      const ops = await downloadBinary(logger, downloadDir, 'pl', `pl-${src.version}`, os.arch(), os.platform());
      return upath.join(ops.baseName, 'binaries', osToBinaryName[newOs(os.platform())]);

    case 'Local':
      return src.path;

    default:
      assertNever(src);
  }
}

export const osToBinaryName: Record<OSType, string> = {
  linux: 'platforma',
  macos: 'platforma',
  windows: 'platforma.exe',
};
