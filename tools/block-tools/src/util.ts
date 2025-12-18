import type { BigIntStats } from 'node:fs';
import fsp from 'node:fs/promises';
import { createHash } from 'node:crypto';

export async function tryLoadFile<T>(
  file: string,
  map: (buf: Buffer) => T,
): Promise<T | undefined> {
  try {
    return map(await fsp.readFile(file));
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return undefined;
    else throw err;
  }
}

export async function tryStat(path: string): Promise<BigIntStats | undefined> {
  try {
    return await fsp.stat(path, { bigint: true });
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export function calculateSha256(bytes: ArrayBuffer): Promise<string> {
  return Promise.resolve(
    createHash('sha256')
      .update(Buffer.from(bytes))
      .digest('hex')
      .toUpperCase(),
  );
}
