import type { Computable } from '@milaboratories/computable';
import { isTimeoutOrCancelError } from '@milaboratories/pl-client';
import type { BigIntStats } from 'node:fs';
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
  timeout: number | AbortSignal = 5000,
): Promise<S> {
  try {
    return await computable.awaitStableValue(
      typeof timeout === 'number' ? AbortSignal.timeout(timeout) : timeout,
    );
  } catch (e: unknown) {
    if (isTimeoutOrCancelError(e)) {
      const fullValue = await computable.getFullValue();
      console.dir(fullValue, { depth: 5 });
      throw new Error(
        `Aborted while awaiting stable value. Unstable marker: ${fullValue.unstableMarker}`,
        { cause: e },
      );
    } else throw e;
  }
}
