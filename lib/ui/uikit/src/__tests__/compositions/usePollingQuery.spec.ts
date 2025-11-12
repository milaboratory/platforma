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

  it('runs immediately when immediateCallback is true and respects timing constraints', async () => {
    const args = ref({ id: 'alpha' });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const { scope, result } = runInScope(() =>
      usePollingQuery(fn, args, {
        minInterval: 1000,
        minDelay: 200,
        immediate: true,
        immediateCallback: true,
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
    expect(data.value.value).toBe('first');
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

    const { scope } = runInScope(() =>
      usePollingQuery(fn, args, {
        minInterval: 300,
        immediate: true,
        immediateCallback: true,
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
      usePollingQuery(fn, args, {
        minInterval: 100,
        immediateCallback: true,
        immediate: true,
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

  it('remains idle until resumed when created inactive', async () => {
    const args = ref({ id: 'alpha' });
    const fn = vi.fn(async () => 'first');

    const { scope, result } = runInScope(() =>
      usePollingQuery(fn, args, {
        minInterval: 250,
        immediate: false,
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
      usePollingQuery(fn, args, {
        minInterval: 100,
        immediate: true,
        immediateCallback: true,
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
      usePollingQuery(fn, args, {
        minInterval: 100,
        immediate: true,
        immediateCallback: true,
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
      usePollingQuery(fn, args, {
        minInterval: 100,
        immediate: true,
        immediateCallback: true,
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
      usePollingQuery(fn, args, {
        minInterval: 100,
        immediate: true,
        immediateCallback: true,
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
      usePollingQuery(fn, args, {
        minInterval: 100,
        immediate: true,
        immediateCallback: true,
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
      usePollingQuery(fn, args, {
        minInterval: 100,
        immediate: true,
        immediateCallback: true,
      }),
    );
    const { lastError, data } = result;

    await advanceTime(0);
    expect(lastError.value).toBeInstanceOf(Error);
    expect(data.value.status).toBe('idle');

    await advanceTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(lastError.value).toBeNull();
    expect(data.value.value).toBe('ok');

    scope.stop();
  });

  it('clears lastError on resume', async () => {
    const args = ref('value');
    const { fn, calls } = createControlledQuery<string, string>();

    const { scope, result } = runInScope(() =>
      usePollingQuery(fn, args, {
        minInterval: 100,
        immediate: true,
        immediateCallback: true,
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
      usePollingQuery(fn, args, {
        minInterval: 100,
        immediate: true,
        immediateCallback: true,
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
      usePollingQuery(fn, args, {
        minInterval: 10,
        immediate: true,
        immediateCallback: true,
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
      usePollingQuery(fn, args, {
        minInterval: 20,
        immediate: true,
        immediateCallback: true,
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

  it('respects maxInFlightRequests when limit reached', async () => {
    const args = ref({ id: 'a' });
    const { fn, calls } = createControlledQuery<typeof args.value, string>();

    const { scope } = runInScope(() =>
      usePollingQuery(fn, args, {
        minInterval: 50,
        immediate: true,
        immediateCallback: true,
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
      usePollingQuery(fn, args, {
        minInterval: 100,
        immediate: true,
        immediateCallback: true,
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

  it('resumes after pause when immediateCallback is disabled', async () => {
    const args = ref(1);
    const fn = vi.fn(async () => 'value');

    const { scope, result } = runInScope(() =>
      usePollingQuery(fn, args, {
        minInterval: 200,
        immediate: false,
        immediateCallback: false,
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

    const { scope, result } = runInScope(() =>
      usePollingQuery(fn, args, {
        minInterval: 0,
        immediate: true,
        immediateCallback: true,
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

    const { scope } = runInScope(() =>
      usePollingQuery(fn, args, {
        minInterval: 200,
        minDelay: 150,
        immediate: true,
        immediateCallback: true,
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
      usePollingQuery(fn, args, {
        minInterval: 100,
        immediate: true,
        immediateCallback: true,
      }),
    );

    await advanceTime(0);
    expect(fn).toHaveBeenCalledTimes(1);
    const controller = calls[0].signal;
    expect(controller.aborted).toBe(false);

    scope.stop();
    expect(controller.aborted).toBe(true);
  });
});
