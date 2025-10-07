import type { MiLogger } from '@milaboratories/ts-helpers';
import { assertNever } from '@milaboratories/ts-helpers';
import { downloadBinary } from './pl_binary_download';
import { getDefaultPlVersion } from './pl_version';
import os from 'node:os';
import upath from 'upath';
import type { OSType } from './os_and_arch';
import { newOs } from './os_and_arch';
import type { Dispatcher } from 'undici';

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
  { logger, downloadDir, src, dispatcher }: {
    logger: MiLogger;
    downloadDir: string;
    src: PlBinarySource;
    dispatcher?: Dispatcher;
  },
): Promise<string> {
  switch (src.type) {
    case 'Download':
      // eslint-disable-next-line no-case-declarations
      const ops = await downloadBinary({
        logger,
        baseDir: downloadDir,
        softwareName: 'pl',
        archiveName: `pl-${src.version}`,
        arch: os.arch(),
        platform: os.platform(),
        dispatcher,
      });
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
