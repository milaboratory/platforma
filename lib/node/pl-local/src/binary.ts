import { assertNever, MiLogger } from "@milaboratories/ts-helpers";
import { getBinary, getBinaryOptions } from "./binary_download";

/** Shows how the binary should be got. */
export type LocalPlBinary =
  | LocalPlBinaryDownload
  | LocalPlBinaryLocal
  | LocalPlBinarySource;

export type LocalPlBinaryDownload = {
  readonly type: 'Download';
  readonly dir: string;
  readonly version: string;
}

export type LocalPlBinaryLocal = {
  readonly type: 'Local';
  readonly path: string;
}

export type LocalPlBinarySource = {
  readonly type: 'Source';
  readonly dir: string;
}

export async function getBinaryPath(
  logger: MiLogger,
  opts: LocalPlBinary,
): Promise<string> {

  const t = opts.type; // without this assignment assertNever doesn't work
  switch (t) {
    case 'Download':
      return await getBinary(logger, getBinaryOptions({
        version: opts.version,
        saveDir: opts.dir,
      }))

    case 'Local':
      return opts.path;

    case 'Source':
      throw new Error('todo: implement');

    default:
      assertNever(t);
  }
}
