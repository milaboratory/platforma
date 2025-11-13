import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { usePollingQuery } from '../../composition/usePollingQuery';

type ControlledCall<Args, Result> = {
  args: Args;
  signal: AbortSignal;
  pause: () => void;
  startTime: number;
  resolve: (value: Result) => void;
  reject: (error?: unknown) => void;
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createControlledQuery<Args, Result>() {
  const calls: ControlledCall<Args, Result>[] = [];
  const fn = vi.fn(
    (callArgs: Args, options: { signal: AbortSignal; pause: () => void }) => {
      const deferred = createDeferred<Result>();
      calls.push({
        args: callArgs,
        signal: options.signal,
        pause: options.pause,
        startTime: Date.now(),
        resolve: deferred.resolve,
        reject: deferred.reject,
      });
      return deferred.promise;
    },
  );
  return { fn, calls };
}

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const advanceTime = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
  await flushMicrotasks();
};

function runInScope<T>(factory: () => T) {
  const scope = effectScope();
  const result = scope.run(factory);
  if (!result) {
    scope.stop();
    throw new Error('Failed to initialise polling scope');
  }
  return { scope, result };
}

describe('usePollingQuery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('runs immediately when triggerOnResume is true and respects timing constraints', async () => {
    const args = ref({ id: 'alpha' });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 1000,
        minDelay: 200,
        autoStart: true,
        triggerOnResume: true,
      }),
    );
    const { data, lastError, isActive } = result;

    expect(data.value).toEqual({ status: 'idle' });
    expect(isActive.value).toBe(true);

    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(calls[0].startTime).toBe(0);

    await advanceTime(400);
    calls[0].resolve('first');
    await flushMicrotasks();

    expect(data.value.status).toBe('synced');
    if (data.value.status === 'synced') {
      expect(data.value.value).toBe('first');
    }
    expect(lastError.value).toBeNull();

    await advanceTime(599);
    expect(fn).toHaveBeenCalledTimes(1);

    await advanceTime(1);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(calls[1].startTime).toBe(1000);
    expect(isActive.value).toBe(true);

    scope.stop();
  });

  it('cycles according to minInterval when callback resolves immediately', async () => {
    const args = ref({ id: 0 });
    const startTimes: number[] = [];
    const fn = vi.fn(async () => {
      startTimes.push(Date.now());
      return 'value';
    });

    const minInterval = ref(300);

    const { scope } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval,
        autoStart: true,
        triggerOnResume: true,
      }),
    );

    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(startTimes[0]).toBe(0);

    await advanceTime(300);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(startTimes[1]).toBe(300);

    await advanceTime(300);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(startTimes[2]).toBe(600);

    scope.stop();
  });

  it('marks status stale on argument change and resyncs after success', async () => {
    const args = ref({ id: 'initial' });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 100,
        triggerOnResume: true,
        autoStart: true,
      }),
    );
    const { data } = result;

    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(1);

    calls[0].resolve('first');
    await flushMicrotasks();
    expect(data.value).toEqual({ status: 'synced', value: 'first' });

    args.value = { id: 'next' };
    expect(data.value).toEqual({ status: 'stale', value: 'first' });

    await advanceTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(calls[1].args).toEqual({ id: 'next' });

    calls[1].resolve('second');
    await flushMicrotasks();
    expect(data.value).toEqual({ status: 'synced', value: 'second' });

    scope.stop();
  });

  it('remains idle on argument changes before first successful poll', async () => {
    const args = ref({ id: 'initial' });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 100,
        triggerOnResume: true,
        autoStart: true,
      }),
    );
    const { data } = result;

    await advanceTime(0);
    expect(data.value).toEqual({ status: 'idle' });

    args.value = { id: 'next' };
    expect(data.value).toEqual({ status: 'idle' });

    scope.stop();
    expect(calls[0]?.signal.aborted).toBe(true);
  });

  it('remains idle until resumed when created inactive', async () => {
    const args = ref({ id: 'alpha' });
    const fn = vi.fn(async () => 'first');

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 250,
        autoStart: false,
      }),
    );
    const { resume, data } = result;

    expect(fn).not.toHaveBeenCalled();
    expect(data.value.status).toBe('idle');

    await advanceTime(1000);
    expect(fn).not.toHaveBeenCalled();

    resume();
    await advanceTime(249);
    expect(fn).not.toHaveBeenCalled();

    await advanceTime(1);
    expect(fn).toHaveBeenCalledTimes(1);

    scope.stop();
  });

  it('debounces argument changes and aborts in-flight requests', async () => {
    const args = ref({ q: 'initial' });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const { scope } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 100,
        autoStart: true,
        triggerOnResume: true,
        debounce: 200,
      }),
    );

    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(1);

    args.value = { q: 'first' };
    expect(calls[0].signal.aborted).toBe(true);
    args.value = { q: 'second' };
    expect(calls[0].signal.aborted).toBe(true);

    calls[0].reject(new Error('aborted'));
    await flushMicrotasks();
    await advanceTime(0);

    await advanceTime(199);
    expect(fn).toHaveBeenCalledTimes(1);

    await advanceTime(201);
    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(calls[1].args).toEqual({ q: 'second' });

    scope.stop();
  });

  it('restarts debounce window on rapid argument updates', async () => {
    const args = ref({ value: 1 });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const { scope } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 100,
        autoStart: true,
        triggerOnResume: true,
        debounce: 150,
      }),
    );

    await advanceTime(0);
    expect(calls).toHaveLength(1);

    args.value = { value: 2 };
    expect(calls[0].signal.aborted).toBe(true);
    calls[0].reject(new Error('aborted'));
    await flushMicrotasks();
    await advanceTime(0);

    await advanceTime(100);
    args.value = { value: 3 };

    await advanceTime(100);
    args.value = { value: 4 };

    await advanceTime(149);
    expect(calls).toHaveLength(1);

    await advanceTime(1);
    await advanceTime(200);
    await advanceTime(0);
    expect(calls).toHaveLength(2);
    expect(calls[1].args).toEqual({ value: 4 });
    expect(calls[1].startTime).toBeGreaterThanOrEqual(350);

    scope.stop();
  });

  it('pauses polling and aborts controllers', async () => {
    const args = ref({ id: 1 });
    const { fn, calls } = createControlledQuery<typeof args.value, number>();

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 100,
        autoStart: true,
        triggerOnResume: true,
      }),
    );
    const { pause, resume, isActive } = result;

    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(isActive.value).toBe(true);

    pause();
    expect(isActive.value).toBe(false);
    expect(calls[0].signal.aborted).toBe(true);

    calls[0].reject(new Error('aborted'));
    await flushMicrotasks();

    await advanceTime(500);
    expect(fn).toHaveBeenCalledTimes(1);

    resume();
    await advanceTime(0);
    expect(isActive.value).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);

    scope.stop();
  });

  it('ignores argument changes while paused until resumed', async () => {
    const args = ref({ id: 1 });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 100,
        autoStart: true,
        triggerOnResume: true,
      }),
    );
    const { pause, resume } = result;

    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(1);

    pause();
    args.value = { id: 2 };
    await advanceTime(500);
    expect(fn).toHaveBeenCalledTimes(1);

    calls[0].reject(new Error('aborted'));
    await flushMicrotasks();

    resume();
    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(calls[1].args).toEqual({ id: 2 });

    scope.stop();
  });

  it('auto pauses on error when pauseOnError is enabled', async () => {
    const args = ref('value');
    const { fn, calls } = createControlledQuery<string, string>();

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 100,
        autoStart: true,
        triggerOnResume: true,
        pauseOnError: true,
      }),
    );
    const { lastError, isActive } = result;

    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(1);

    calls[0].reject(new Error('failure'));
    await flushMicrotasks();

    expect(lastError.value?.message).toBe('failure');
    expect(isActive.value).toBe(false);

    await advanceTime(500);
    expect(fn).toHaveBeenCalledTimes(1);

    scope.stop();
  });

  it('continues polling after errors when pauseOnError is disabled', async () => {
    const args = ref('value');
    let attempt = 0;
    const fn = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('boom');
      return 'ok';
    });

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 100,
        autoStart: true,
        triggerOnResume: true,
      }),
    );
    const { lastError, data } = result;

    await advanceTime(0);
    expect(lastError.value).toBeInstanceOf(Error);
    expect(data.value.status).toBe('idle');

    await advanceTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(lastError.value).toBeNull();
    if (data.value.status === 'synced') {
      expect(data.value.value).toBe('ok');
    } else {
      throw new Error('Expected polling data to be synced after successful retry');
    }

    scope.stop();
  });

  it('clears lastError on resume', async () => {
    const args = ref('value');
    const { fn, calls } = createControlledQuery<string, string>();

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 100,
        autoStart: true,
        triggerOnResume: true,
        pauseOnError: true,
      }),
    );
    const { lastError, resume } = result;

    await advanceTime(0);
    calls[0].reject(new Error('failure'));
    await flushMicrotasks();
    expect(lastError.value).toBeInstanceOf(Error);

    resume();
    expect(lastError.value).toBeNull();

    scope.stop();
  });

  it('converts thrown primitives into Error instances', async () => {
    const args = ref('value');
    const fn = vi.fn(async () => {
      throw 'failure';
    });

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 100,
        autoStart: true,
        triggerOnResume: true,
      }),
    );
    const { lastError } = result;

    await advanceTime(0);
    expect(lastError.value).toBeInstanceOf(Error);
    expect(lastError.value?.message).toBe('failure');

    scope.stop();
  });

  it('ignores outdated results thanks to version tracking', async () => {
    const args = ref({ id: 'a' });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 10,
        autoStart: true,
        triggerOnResume: true,
        maxInFlightRequests: 2,
      }),
    );
    const { data } = result;

    await advanceTime(0);
    args.value = { id: 'b' };
    await advanceTime(10);

    expect(fn).toHaveBeenCalledTimes(2);

    calls[1].resolve('latest');
    await flushMicrotasks();
    expect(data.value).toEqual({ status: 'synced', value: 'latest' });

    calls[0].resolve('stale');
    await flushMicrotasks();
    expect(data.value).toEqual({ status: 'synced', value: 'latest' });

    scope.stop();
  });

  it('allows overlapping requests up to the configured limit', async () => {
    const args = ref({ id: 'a' });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const { scope } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 20,
        autoStart: true,
        triggerOnResume: true,
        maxInFlightRequests: 2,
      }),
    );

    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(1);

    args.value = { id: 'b' };
    await advanceTime(20);
    expect(fn).toHaveBeenCalledTimes(2);

    args.value = { id: 'c' };
    await advanceTime(20);
    expect(fn).toHaveBeenCalledTimes(2);

    calls[0].resolve('first');
    await flushMicrotasks();
    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(calls[2].args).toEqual({ id: 'c' });

    scope.stop();
  });

  it('exposes reactive inFlightCount', async () => {
    const args = ref({ id: 'seed' });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 20,
        autoStart: true,
        triggerOnResume: true,
        maxInFlightRequests: 2,
      }),
    );
    const { inFlightCount } = result;

    expect(inFlightCount.value).toBe(0);

    await advanceTime(0);
    expect(inFlightCount.value).toBe(1);

    args.value = { id: 'next' };
    await advanceTime(20);
    expect(inFlightCount.value).toBe(2);

    calls[0].resolve('first');
    await flushMicrotasks();
    expect(inFlightCount.value).toBe(1);

    calls[1].resolve('second');
    await flushMicrotasks();
    expect(inFlightCount.value).toBe(0);

    scope.stop();
  });

  it('keeps inFlightCount > 0 for aborted but unresolved calls', async () => {
    const args = ref({ id: 1 });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 100,
        autoStart: true,
        triggerOnResume: true,
      }),
    );
    const { pause, inFlightCount } = result;

    await advanceTime(0);
    expect(inFlightCount.value).toBe(1);

    pause();
    expect(calls[0].signal.aborted).toBe(true);
    expect(inFlightCount.value).toBe(1);

    calls[0].reject(new Error('aborted'));
    await flushMicrotasks();
    expect(inFlightCount.value).toBe(0);

    scope.stop();
  });

  it('respects maxInFlightRequests when limit reached', async () => {
    const args = ref({ id: 'a' });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const { scope } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 50,
        autoStart: true,
        triggerOnResume: true,
        maxInFlightRequests: 1,
      }),
    );

    await advanceTime(0);
    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(1);

    args.value = { id: 'b' };
    await advanceTime(50);
    expect(fn).toHaveBeenCalledTimes(1);

    calls[0].resolve('ignored');
    await flushMicrotasks();

    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(calls[1].args).toEqual({ id: 'b' });

    scope.stop();
  });

  it('allows callback to pause polling via provided helper', async () => {
    const args = ref(1);
    const fn = vi.fn(async (_: number, { pause }: { pause: () => void }) => {
      pause();
      return 42;
    });

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 100,
        autoStart: true,
        triggerOnResume: true,
      }),
    );
    const { isActive } = result;

    await advanceTime(0);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(isActive.value).toBe(false);

    await advanceTime(500);
    expect(fn).toHaveBeenCalledTimes(1);

    scope.stop();
  });

  it('resumes after pause when triggerOnResume is disabled', async () => {
    const args = ref(1);
    const fn = vi.fn(async () => 'value');

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 200,
        autoStart: false,
        triggerOnResume: false,
      }),
    );
    const { resume } = result;

    resume();
    await advanceTime(199);
    expect(fn).not.toHaveBeenCalled();

    await advanceTime(1);
    expect(fn).toHaveBeenCalledTimes(1);

    scope.stop();
  });

  it('does not start when minInterval is non-positive', async () => {
    const args = ref({ id: 'nope' });
    const fn = vi.fn(async () => 'value');

    const minInterval = ref(0);

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval,
        autoStart: true,
        triggerOnResume: true,
      }),
    );
    const { isActive, resume } = result;

    expect(isActive.value).toBe(false);
    await advanceTime(0);
    expect(fn).not.toHaveBeenCalled();

    resume();
    await advanceTime(0);
    expect(fn).not.toHaveBeenCalled();

    scope.stop();
  });

  it('enforces minDelay when callback duration exceeds minInterval', async () => {
    const args = ref({ id: 'delayed' });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const minDelay = ref(150);

    const { scope } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 200,
        minDelay,
        autoStart: true,
        triggerOnResume: true,
      }),
    );

    await advanceTime(0);
    const firstStart = calls[0].startTime;
    await advanceTime(350);
    calls[0].resolve('done');
    await flushMicrotasks();

    await advanceTime(149);
    expect(fn).toHaveBeenCalledTimes(1);

    await advanceTime(1);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(calls[1].startTime - firstStart).toBeGreaterThanOrEqual(500);

    scope.stop();
  });

  it('aborts active requests when scope is disposed', async () => {
    const args = ref({ id: 'cleanup' });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const { scope } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 100,
        autoStart: true,
        triggerOnResume: true,
      }),
    );

    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
    const controller = calls[0].signal;
    expect(controller.aborted).toBe(false);

    scope.stop();
    expect(controller.aborted).toBe(true);
  });

  // EDGE CASE TESTS - These should fail with current implementation

  it('handles concurrent pause() calls from within callback', async () => {
    const args = ref({ id: 'concurrent' });
    let pauseFn: (() => void) | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = vi.fn(async (_: any, { pause }: { pause: () => void }) => {
      pauseFn = pause;
      // Simulate async operation where pause might be called multiple times
      await new Promise((resolve) => setTimeout(resolve, 50));
      pause(); // First pause
      pause(); // Second pause - should be idempotent
      return 'result';
    });

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 100,
        autoStart: true,
        triggerOnResume: true,
      }),
    );
    const { isActive, pause: externalPause } = result;

    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(isActive.value).toBe(true);

    // Call pause from outside while callback is executing
    externalPause();
    expect(isActive.value).toBe(false);

    // The callback's pause should not reactivate or cause issues
    pauseFn?.();

    await advanceTime(100);
    expect(isActive.value).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);

    scope.stop();
  });

  it('eventually processes latest args after debounce pause/resume', async () => {
    const args = ref({ value: 1 });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 100,
        autoStart: true,
        triggerOnResume: true,
        debounce: 200,
      }),
    );
    const { pause, resume, data } = result;

    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
    calls[0].resolve('initial');
    await flushMicrotasks();
    expect(data.value).toEqual({ status: 'synced', value: 'initial' });

    // Change args to start debounce
    args.value = { value: 2 };
    expect(data.value).toEqual({ status: 'stale', value: 'initial' });

    // Pause during debounce
    await advanceTime(100);
    pause();

    // Change args while paused
    args.value = { value: 3 };

    // Resume - first poll may use the pre-pause snapshot, but subsequent polls must converge
    resume();
    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(calls[1].args).toEqual({ value: 2 });

    calls[1].resolve('second');
    await flushMicrotasks();

    await advanceTime(100);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(calls[2].args).toEqual({ value: 3 });

    calls[2].resolve('latest');
    await flushMicrotasks();
    expect(data.value).toEqual({ status: 'synced', value: 'latest' });

    scope.stop();
  });

  it('correctly tracks versions when error occurs during argument change', async () => {
    const args = ref({ id: 'a' });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 50,
        autoStart: true,
        triggerOnResume: true,
        maxInFlightRequests: 2,
      }),
    );
    const { data, lastError } = result;

    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // Change args while first request is in flight
    args.value = { id: 'b' };
    await advanceTime(50);
    expect(fn).toHaveBeenCalledTimes(2);

    // First request fails after args changed
    calls[0].reject(new Error('error-a'));
    await flushMicrotasks();

    // Error from old version should not set lastError
    expect(lastError.value).toBeNull();
    expect(data.value).toEqual({ status: 'idle' });

    // Second request succeeds
    calls[1].resolve('result-b');
    await flushMicrotasks();
    expect(data.value).toEqual({ status: 'synced', value: 'result-b' });
    expect(lastError.value).toBeNull();

    scope.stop();
  });

  it('handles rapid minDelay changes during execution', async () => {
    const args = ref({ id: 'test' });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();
    const minDelay = ref<number | undefined>(100);

    const { scope } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 50,
        minDelay,
        autoStart: true,
        triggerOnResume: true,
      }),
    );

    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // Start time of first request
    const firstStart = calls[0].startTime;

    // Change minDelay to undefined while request is in flight
    minDelay.value = undefined;

    // Complete first request after 30ms
    await advanceTime(30);
    calls[0].resolve('first');
    await flushMicrotasks();

    // With minDelay now undefined, next poll should start at minInterval (50ms from start)
    await advanceTime(19);
    expect(fn).toHaveBeenCalledTimes(1);

    await advanceTime(1);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(calls[1].startTime).toBe(firstStart + 50);

    scope.stop();
  });

  it('prevents duplicate scheduling when args change completes a request', async () => {
    const args = ref({ id: 'a' });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const { scope } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 100,
        autoStart: true,
        triggerOnResume: true,
      }),
    );

    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // Change args while request is in flight
    args.value = { id: 'b' };

    // This aborts the first request and schedules a new one
    // But when the first request completes (even if aborted), it should not schedule again

    calls[0].reject(new Error('aborted'));
    await flushMicrotasks();

    // Should schedule only once for the new args
    await advanceTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(calls[1].args).toEqual({ id: 'b' });

    // Complete second request and wait for next poll
    calls[1].resolve('result-b');
    await flushMicrotasks();

    await advanceTime(100);
    // Should have exactly one more call, not duplicated
    expect(fn).toHaveBeenCalledTimes(3);
    expect(calls[2].args).toEqual({ id: 'b' });

    scope.stop();
  });

  it('cleans up waiters array on dispose to prevent memory leak', async () => {
    const args = ref({ id: 'test' });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 50,
        autoStart: true,
        triggerOnResume: true,
        maxInFlightRequests: 1,
      }),
    );
    const { inFlightCount } = result;

    // Start first request
    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(inFlightCount.value).toBe(1);

    // Try to change args multiple times while first request is in flight
    // This should queue up waiters
    args.value = { id: 'b' };
    await advanceTime(50);
    args.value = { id: 'c' };
    await advanceTime(50);
    args.value = { id: 'd' };

    // Dispose scope while waiters are queued
    scope.stop();

    // Complete the in-flight request after dispose
    calls[0].resolve('result');
    await flushMicrotasks();

    // Should not throw or cause issues
    expect(inFlightCount.value).toBe(0);
  });

  it('handles argument changes after pause but before resumeimmediately after arguments provided', async () => {
    const args = ref({ value: 1 });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 100,
        autoStart: false,
        triggerOnResume: false,
      }),
    );
    const { resume, data, isActive } = result;

    // Provide args but don't resume yet
    expect(data.value).toEqual({ status: 'idle' });
    expect(isActive.value).toBe(false);

    // Change args before first resume
    args.value = { value: 2 };
    args.value = { value: 3 };

    // Now resume - should use latest args
    resume();
    expect(isActive.value).toBe(true);

    await advanceTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(calls[0].args).toEqual({ value: 3 });

    scope.stop();
  });

  it('correctly handles error from outdated version when maxInFlightRequests > 1', async () => {
    const args = ref({ id: 'a' });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 50,
        autoStart: true,
        triggerOnResume: true,
        maxInFlightRequests: 3,
      }),
    );
    const { data: _data, lastError } = result;

    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // Change args - this aborts the in-flight request and schedules a new poll
    args.value = { id: 'b' };
    await advanceTime(50);
    expect(fn).toHaveBeenCalledTimes(2);

    // Change args again to ensure multiple versions overlap
    args.value = { id: 'c' };
    await advanceTime(50);
    expect(fn).toHaveBeenCalledTimes(3);

    // First request (outdated) fails
    calls[0].reject(new Error('error-old-1'));
    await flushMicrotasks();

    // Should not set lastError from old version
    expect(lastError.value).toBeNull();

    // Second request (also outdated) fails
    calls[1].reject(new Error('error-old-2'));
    await flushMicrotasks();

    // Still should not set lastError
    expect(lastError.value).toBeNull();

    // Current request fails
    calls[2].reject(new Error('error-current'));
    await flushMicrotasks();

    // Now lastError should be set
    expect(lastError.value?.message).toBe('error-current');

    scope.stop();
  });

  it('respects minInterval when triggerOnResume is false and resuming after pause', async () => {
    const args = ref({ id: 'test' });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 300,
        autoStart: true,
        triggerOnResume: false, // Important: false here
      }),
    );
    const { pause, resume } = result;

    // Start with autoStart, should wait for minInterval
    await advanceTime(299);
    expect(fn).not.toHaveBeenCalled();
    await advanceTime(1);
    expect(fn).toHaveBeenCalledTimes(1);

    // Pause immediately
    pause();
    calls[0].reject(new Error('aborted'));
    await flushMicrotasks();

    // Resume - should wait for minInterval again, not trigger immediately
    resume();
    await advanceTime(299);
    expect(fn).toHaveBeenCalledTimes(1); // Still just 1 call

    await advanceTime(1);
    expect(fn).toHaveBeenCalledTimes(2); // Now 2 calls

    scope.stop();
  });

  it('handles simultaneous pause from callback and external pause', async () => {
    const args = ref({ id: 'test' });
    let callbackPause: (() => void) | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = vi.fn(async (_: any, { pause }: { pause: () => void }) => {
      callbackPause = pause;
      // Wait for external code to run
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'result';
    });

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval: 100,
        autoStart: true,
        triggerOnResume: true,
      }),
    );
    const { pause: externalPause, resume, isActive } = result;

    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(isActive.value).toBe(true);

    // Both pause at nearly the same time
    await advanceTime(5);
    callbackPause?.(); // Pause from callback
    externalPause(); // Pause from external

    expect(isActive.value).toBe(false);

    await advanceTime(100);
    expect(fn).toHaveBeenCalledTimes(1); // No additional calls

    // Resume should work normally
    resume();
    await advanceTime(0);
    expect(isActive.value).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);

    scope.stop();
  });

  it('handles reactive minInterval becoming positive after being zero', async () => {
    const args = ref({ id: 'test' });
    const fn = vi.fn(async () => 'result');
    const minInterval = ref(0);

    const { scope, result } = runInScope(() =>
      usePollingQuery(args, fn, {
        minInterval,
        autoStart: true,
        triggerOnResume: true,
      }),
    );
    const { isActive, resume } = result;

    // Should not start because minInterval is 0
    expect(isActive.value).toBe(false);
    await advanceTime(100);
    expect(fn).not.toHaveBeenCalled();

    // Change minInterval to positive value
    minInterval.value = 100;

    // Resume should now work
    resume();
    expect(isActive.value).toBe(true);
    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // Should continue polling
    await advanceTime(100);
    expect(fn).toHaveBeenCalledTimes(2);

    scope.stop();
  });
});
