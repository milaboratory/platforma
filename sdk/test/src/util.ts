import { Computable } from '@milaboratory/computable';
import { isTimeoutOrCancelError } from '@milaboratory/pl-client-v2';
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

export async function awaitStableState<S>(
  computable: Computable<unknown, S>,
  timeout: number | AbortSignal = 2000
): Promise<S> {
  try {
    return await computable.awaitStableValue(
      typeof timeout === 'number' ? AbortSignal.timeout(timeout) : timeout
    );
  } catch (e: unknown) {
    if (isTimeoutOrCancelError(e)) {
      console.dir(await computable.getFullValue(), { depth: 5 });
      throw new Error('Aborted.', { cause: e });
    } else throw e;
  }
}
