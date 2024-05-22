import { Aborted, jitter, sleep } from './temporal';

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
  const result = jitter({ms: 1000, factor: 0.1});
  expect(result).toBeGreaterThanOrEqual(900);
  expect(result).toBeLessThanOrEqual(1100);
})
