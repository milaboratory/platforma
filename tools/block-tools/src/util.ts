import { BigIntStats } from 'node:fs';
import fsp from 'node:fs/promises';

export async function tryLoadFile<T>(
  file: string,
  map: (buf: Buffer) => T
): Promise<T | undefined> {
  try {
    return map(await fsp.readFile(file));
  } catch (err: any) {
    if (err.code == 'ENOENT') return undefined;
    else throw new Error('', { cause: err });
  }
}

export async function tryStat(path: string): Promise<BigIntStats | undefined> {
  try {
    return await fsp.stat(path, { bigint: true });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}
