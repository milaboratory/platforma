import { test, expect } from '@jest/globals';
import { ConcurrencyLimitingExecutor } from './concurrency_limiter';

test('simple concurrency limiter test 1', async () => {
  let runningTasks = 0;
  const e = new ConcurrencyLimitingExecutor(4);
  const taskResults: Promise<number>[] = [];
  const expected: number[] = [];
  for (let i = 0; i < 1000; ++i) {
    const a = i;
    expected.push(i);
    taskResults.push(
      e.run(async () => {
        try {
          runningTasks++;
          expect(runningTasks).toBeLessThanOrEqual(4);
          return a;
        } finally {
          runningTasks--;
        }
      })
    );
  }
  const results = await Promise.all(taskResults);
  expect(results).toStrictEqual(expected);
});

test('simple concurrency limiter test 2', async () => {
  let runningTasks = 0;
  const e = new ConcurrencyLimitingExecutor(4);
  const taskResults: Promise<number>[] = [];
  for (let i = 0; i < 1000; ++i) {
    const a = i;
    taskResults.push(
      e.run(async () => {
        try {
          runningTasks++;
          expect(runningTasks).toBeLessThanOrEqual(4);
          if (runningTasks % 7 === 0) throw new Error('');
          return a;
        } finally {
          runningTasks--;
        }
      })
    );
  }

  for (let i = 0; i < 1000; ++i) expect(await taskResults[i]).toStrictEqual(i);
});
