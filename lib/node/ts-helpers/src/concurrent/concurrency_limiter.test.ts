import { test, expect } from "vitest";
import { ConcurrencyLimitingExecutor } from "./concurrency_limiter";
import * as tp from "timers/promises";

test.each([{ limit: 1 }, { limit: 2 }, { limit: 4 }])(
  "simple concurrency limiter test normal (limit=$limit)",
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
        }),
      );
    }
    const results = await Promise.all(taskResults);
    expect(results).toStrictEqual(expected);
  },
);

test.each([{ limit: 1 }, { limit: 2 }, { limit: 4 }])(
  "simple concurrency limiter test fake async (limit=$limit)",
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
        }),
      );
    }
    const results = await Promise.all(taskResults);
    expect(results).toStrictEqual(expected);
  },
);

test.each([{ limit: 1 }, { limit: 2 }, { limit: 4 }])(
  "simple concurrency limiter test with errors (limit=$limit)",
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
            if (a % 7 === 0) throw new Error("");
            return a;
          } finally {
            runningTasks--;
          }
        }),
      );
    }

    for (let i = 0; i < 1000; ++i)
      if (i % 7 === 0) await expect(async () => await taskResults[i]).rejects.toThrow();
      else expect(await taskResults[i]).toStrictEqual(i);
  },
);

test.each([{ limit: 1 }, { limit: 2 }, { limit: 4 }])(
  "simple concurrency limiter test with async (limit=$limit)",
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
          }),
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
                  if (a % 7 === 0) throw new Error("");
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
          })(),
        );
    }

    for (let i = 0; i < 3000; ++i) expect(await taskResults[i]).toStrictEqual(i % 14 === 0 ? 0 : i);
  },
);

test("a cancelled task that never settles does not wedge the single slot", async () => {
  const e = new ConcurrencyLimitingExecutor(1);

  // Occupy the only slot with a task that ignores its signal and never settles.
  const ac = new AbortController();
  const stuck = e.run(() => new Promise<void>(() => {}), ac.signal);
  stuck.catch(() => {}); // avoid unhandled rejection once aborted

  // A second task must queue behind it.
  let secondRan = false;
  const second = e.run(async () => {
    secondRan = true;
    return 42;
  });

  await tp.setImmediate();
  expect(secondRan).toBe(false); // confirm it is actually blocked

  // Cancelling the stuck task must free the slot so the queued task runs.
  ac.abort();
  await expect(stuck).rejects.toBeDefined();
  expect(await second).toBe(42);
});

test("a task cancelled while queued bails at admission without losing the permit", async () => {
  const e = new ConcurrencyLimitingExecutor(1);

  let releaseFirst: () => void = () => {};
  const first = e.run(() => new Promise<void>((res) => (releaseFirst = res)));

  const ac = new AbortController();
  let cancelledBodyRan = false;
  const cancelledWhileQueued = e.run(async () => {
    cancelledBodyRan = true;
    return "never";
  }, ac.signal);
  cancelledWhileQueued.catch(() => {});

  let thirdRan = false;
  const third = e.run(async () => {
    thirdRan = true;
    return "ok";
  });

  // Cancelled while still queued behind `first`. It rejects only once admitted (when
  // `first` releases the slot), without ever running its body; the permit then reaches
  // the live waiter behind it.
  ac.abort();
  releaseFirst();
  await first;

  await expect(cancelledWhileQueued).rejects.toBeDefined();
  expect(cancelledBodyRan).toBe(false);
  expect(await third).toBe("ok");
  expect(thirdRan).toBe(true);
});

test("already-aborted signal rejects without taking a slot", async () => {
  const e = new ConcurrencyLimitingExecutor(1);
  const ac = new AbortController();
  ac.abort();

  await expect(e.run(async () => 1, ac.signal)).rejects.toBeDefined();

  // It rejected before the queue (no `runningTasks` bump), so the slot is free for the next.
  expect(await e.run(async () => 2)).toBe(2);
});

test("an already-aborted signal rejects promptly even while the executor is busy", async () => {
  const e = new ConcurrencyLimitingExecutor(1);

  // Occupy the only slot with a task that stays pending.
  let releaseBusy: () => void = () => {};
  const busy = e.run(() => new Promise<void>((res) => (releaseBusy = res)));

  // An already-cancelled request must reject without waiting in line behind `busy`.
  const ac = new AbortController();
  ac.abort();
  await expect(e.run(async () => "ran", ac.signal)).rejects.toBeDefined();

  releaseBusy();
  await busy;
});
