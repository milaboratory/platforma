import { Aborted, sleep } from './temporal';

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
