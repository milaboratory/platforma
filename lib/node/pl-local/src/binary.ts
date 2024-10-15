import { assertNever, MiLogger } from '@milaboratories/ts-helpers';
import { downloadBinary } from './binary_download';

/** Shows how the binary should be got. */
export type LocalPlBinary = LocalPlBinaryDownload | LocalPlBinaryLocal | LocalPlBinarySource;

export type LocalPlBinaryDownload = {
  readonly type: 'Download';
  readonly version: string;
};

export type LocalPlBinaryLocal = {
  readonly type: 'Local';
  readonly path: string;
};

export type LocalPlBinarySource = {
  readonly type: 'Source';
  readonly dir: string;
};

export async function getBinaryPath(
  logger: MiLogger,
  downloadDir: string,
  opts: LocalPlBinary
): Promise<string> {
  switch (opts.type) {
    case 'Download':
      return await downloadBinary(logger, downloadDir, opts.version);

    case 'Local':
      return opts.path;

    case 'Source':
      throw new Error('todo: implement');

    default:
      assertNever(opts);
  }
}
