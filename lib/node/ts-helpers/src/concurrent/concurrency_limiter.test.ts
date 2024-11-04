import { test, expect } from '@jest/globals';
import { ConcurrencyLimitingExecutor } from './concurrency_limiter';
import * as tp from 'timers/promises';

test.each([{ limit: 1 }, { limit: 2 }, { limit: 4 }])(
  'simple concurrency limiter test normal (limit=$limit)',
  async ({ limit }) => {
    let runningTasks = 0;
    const e = new ConcurrencyLimitingExecutor(limit);
    const taskResults: Promise<number>[] = [];
    const expected: number[] = [];
    for (let i = 0; i < 1000; ++i) {
      const a = i;
      expected.push(i);
      taskResults.push(
        e.run(async () => {
          try {
            runningTasks++;
            expect(runningTasks).toBeLessThanOrEqual(limit);
            return a;
          } finally {
            runningTasks--;
          }
        })
      );
    }
    const results = await Promise.all(taskResults);
    expect(results).toStrictEqual(expected);
  }
);

test.each([{ limit: 1 }, { limit: 2 }, { limit: 4 }])(
  'simple concurrency limiter test fake async (limit=$limit)',
  async ({ limit }) => {
    let runningTasks = 0;
    const e = new ConcurrencyLimitingExecutor(limit);
    const taskResults: Promise<number>[] = [];
    const expected: number[] = [];
    for (let i = 0; i < 1000; ++i) {
      const a = i;
      expected.push(i);
      taskResults.push(
        e.run(() => {
          try {
            runningTasks++;
            expect(runningTasks).toBeLessThanOrEqual(limit);
            return a as any as Promise<number>;
          } finally {
            runningTasks--;
          }
        })
      );
    }
    const results = await Promise.all(taskResults);
    expect(results).toStrictEqual(expected);
  }
);

test.each([{ limit: 1 }, { limit: 2 }, { limit: 4 }])(
  'simple concurrency limiter test with errors (limit=$limit)',
  async ({ limit }) => {
    let runningTasks = 0;
    const e = new ConcurrencyLimitingExecutor(limit);
    const taskResults: Promise<number>[] = [];
    for (let i = 0; i < 1000; ++i) {
      const a = i;
      taskResults.push(
        e.run(async () => {
          try {
            runningTasks++;
            expect(runningTasks).toBeLessThanOrEqual(limit);
            if (a % 7 === 0) throw new Error('');
            return a;
          } finally {
            runningTasks--;
          }
        })
      );
    }

    for (let i = 0; i < 1000; ++i)
      if (i % 7 === 0) await expect(async () => await taskResults[i]).rejects.toThrow();
      else expect(await taskResults[i]).toStrictEqual(i);
  }
);

test.each([{ limit: 1 }, { limit: 2 }, { limit: 4 }])(
  'simple concurrency limiter test with async (limit=$limit)',
  async ({ limit }) => {
    let runningTasks = 0;
    const e = new ConcurrencyLimitingExecutor(limit);
    const taskResults: Promise<number>[] = [];
    for (let i = 0; i < 3000; ++i) {
      const a = i;
      if (a % 7 === 0) await tp.setImmediate();
      if (a % 9 === 0) await tp.setTimeout(1);
      if (a % 2 === 1)
        taskResults.push(
          e.run(() => {
            try {
              runningTasks++;
              expect(runningTasks).toBeLessThanOrEqual(limit);
              return a as any as Promise<number>;
            } finally {
              runningTasks--;
            }
          })
        );
      else
        taskResults.push(
          (async () => {
            try {
              return await e.run(async () => {
                try {
                  if (a % 3 === 0) await tp.setTimeout(1);
                  runningTasks++;
                  if (a % 5 === 0) await tp.setTimeout(1);
                  expect(runningTasks).toBeLessThanOrEqual(limit);
                  if (a % 7 === 0) throw new Error('');
                  if (a % 11 === 0) await tp.setTimeout(1);
                  return a;
                } finally {
                  if (a % 13 === 0) await tp.setTimeout(1);
                  runningTasks--;
                  if (a % 17 === 0) await tp.setTimeout(1);
                }
              });
            } catch {
              return 0;
            }
          })()
        );
    }

    for (let i = 0; i < 3000; ++i) expect(await taskResults[i]).toStrictEqual(i % 14 === 0 ? 0 : i);
  }
);
