import { BigIntStats } from 'node:fs';
import * as fsp from 'node:fs/promises';

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
