import {
  Aborted,
  createRetryState,
  jitter,
  nextRetryStateOrError,
  RetryOptions,
  sleep,
  tryNextRetryState
} from './temporal';

test('timeout', async () => {
  await sleep(10);
});

test('abort timeout', async () => {
  await expect(async () => {
    await sleep(1000, AbortSignal.timeout(10));
  })
    .rejects
    .toThrow(Aborted);
});

test('aborted timeout', async () => {
  await expect(async () => {
    await sleep(1000, AbortSignal.abort());
  })
    .rejects
    .toThrow(/aborted/);
});

test('jitter', () => {
  const result = jitter({ ms: 1000, factor: 0.1 });
  expect(result).toBeGreaterThanOrEqual(900);
  expect(result).toBeLessThanOrEqual(1100);
});

test('delay linear', () => {
  const opts: RetryOptions = {
    type: 'linearBackoff',
    jitter: 0,
    backoffStep: 1000,
    initialDelay: 1000,
    maxAttempts: 10
  };
  const state1 = createRetryState(opts);
  const state2 = nextRetryStateOrError(state1);
  expect(state2.nextDelay).toBeCloseTo(2000, 2);
  expect(state2.attemptsLeft).toEqual(8);
});

test('delay exponential', () => {
  const opts: RetryOptions = {
    type: 'exponentialBackoff',
    jitter: 0,
    backoffMultiplier: 1.5,
    initialDelay: 1000,
    maxAttempts: 10
  };
  const state1 = createRetryState(opts);
  const state2 = nextRetryStateOrError(state1);
  expect(state2.nextDelay).toBeCloseTo(1500, 2);
  expect(state2.attemptsLeft).toEqual(8);
});

test('delay error', () => {
  const opts: RetryOptions = {
    type: 'exponentialBackoff',
    jitter: 0,
    backoffMultiplier: 1.5,
    initialDelay: 1000,
    maxAttempts: 2
  };
  const state1 = createRetryState(opts);
  const state2 = nextRetryStateOrError(state1);
  expect(() => nextRetryStateOrError(state2)).toThrow(/reached/);
});
