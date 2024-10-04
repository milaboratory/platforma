import { MiLogger } from "@milaboratories/ts-helpers";
import { getBinary, getBinaryOptions } from "./binary_download";

export type LocalPlBinary = LocalPlBinaryDownload | LocalPlBinaryLocal | LocalPlBinarySource;

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
) {
  if (opts.type == 'Download') {
    return await getBinary(logger, getBinaryOptions({
      version: opts.version,
      saveDir: opts.dir,
    }))

  } else if (opts.type == 'Local') {
    return opts.path;

  } else {
    throw new Error('todo: implement');
  }
}
