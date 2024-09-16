import * as tp from 'node:timers/promises';
import { isTimeoutOrCancelError } from './errors';

test('timeout of sleep error type detection', async () => {
  let noError = false;
  try {
    await tp.setTimeout(1000, undefined, { signal: AbortSignal.timeout(10) });
    noError = true;
  } catch (err: unknown) {
    expect((err as any).code).toStrictEqual('ABORT_ERR');
    expect(isTimeoutOrCancelError(err)).toEqual(true);
  }
  expect(noError).toBe(false);
});
