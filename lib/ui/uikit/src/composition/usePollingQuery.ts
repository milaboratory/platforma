import type { Ref } from 'vue';
import { onScopeDispose, readonly, ref, shallowRef, watch } from 'vue';

type PollingStatus = 'idle' | 'synced' | 'stale';

type AbortReason = 'args' | 'pause' | 'dispose';

interface PollingData<Result> {
  status: PollingStatus;
  value?: Result;
}

interface InternalOptions {
  minInterval: number;
  minDelay: number;
  immediate: boolean;
  immediateCallback: boolean;
  pauseOnError: boolean;
  maxInFlightRequests: number;
  debounce: number;
}

interface Waiter {
  resolve: () => void;
}

const enum ScheduleSource {
  Normal = 'normal',
  External = 'external',
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === 'string' ? error : JSON.stringify(error));
}

/**
 * Repeatedly executes an asynchronous query while tracking arguments, state transitions,
 * and result freshness.
 *
 * @remarks
 *
 * ### Typical usage
 *
 * ```ts
 * const args = ref({ id: 'item-1' });
 * const { data, pause, resume, lastError } = usePollingQuery(args, fetchItem, {
 *   minInterval: 5_000,
 *   minDelay: 250,
 * });
 * ```
 *
 * The composable polls `fetchItem` while `resume()`d. Whenever the `args` ref changes the current
 * request is aborted, the status becomes `'stale'`, and a new poll is scheduled after the optional
 * debounce period and the configured timing constraints. Results from older requests are ignored
 * through version tracking, ensuring consumers only observe the freshest payload.
 *
 * ### Timing behaviour
 *
 * - `minInterval` defines the minimum duration between the start times of consecutive polls.
 * - `minDelay` (optional) enforces a minimum wait time between a poll finishing and the next poll starting.
 * - After each poll completes, the next poll is scheduled `max(minInterval - elapsed, minDelay)` ms later.
 * - When arguments change, the next poll still respects both constraints while also honouring the debounce.
 *
 * ### Abort handling
 *
 * Each poll receives a dedicated `AbortSignal`. The signal is aborted when pausing, disposing
 * the scope, or when the arguments ref changes. Queries should surface aborts by listening to
 * the signal. Aborted requests may settle later; outdated results are discarded via version checks.
 *
 * ### Pause, resume, and callback control
 *
 * - `pause()` stops future polls, clears pending timeouts, and aborts in-flight requests.
 * - `resume()` is idempotent; it reactivates polling only when currently inactive.
 * - The callback receives a bound `pause()` helper for conditional pausing.
 *
 * ### Error handling
 *
 * Errors bubble into `lastError`; they reset on the next successful poll or when `resume()`
 * transitions from inactive to active. With `pauseOnError: true` the composable pauses automatically.
 *
 * ### Argument tracking
 *
 * - Initial state is `{ status: 'idle' }`.
 * - Any argument change marks the status `'stale'` immediately.
 * - A successful poll for the latest arguments marks the status `'synced'` and updates `value`.
 *
 * ### Request versioning and concurrency
 *
 * Each poll increments an internal version counter. Only the latest version updates shared state,
 * preventing stale results from overwriting fresh data. `maxInFlightRequests` limits concurrent
 * polls; values > 1 allow the next poll to begin even if aborted requests are still settling, while
 * still capping total concurrency to protect upstream services.
 *
 * ### Debouncing
 *
 * Use `debounce` to accumulate rapid argument changes. The status still transitions to `'stale'`
 * immediately, all running polls are aborted, and the new poll waits for the debounce window
 * (and the timing constraints) before executing.
 *
 * ### Options
 *
 * - `minInterval` — required; must be positive. Zero or negative disables polling (`resume()` no-op).
 * - `minDelay` — optional delay after completion before the next poll may start.
 * - `immediate` — start in active mode (default `true`).
 * - `immediateCallback` — run the callback immediately on `resume()` (default `false`).
 * - `pauseOnError` — automatically pauses when the callback throws (default `false`).
 * - `maxInFlightRequests` — maximum concurrent polls (default `1`).
 * - `debounce` — debounce window for argument changes in milliseconds (default `0`).
 *
 * ### Returns
 *
 * - `data` — readonly ref of `{ status, value }`.
 * - `lastError` — readonly ref of the latest error (or `null`).
 * - `isActive` — readonly ref indicating active polling.
 * - `pause()` and `resume()` controls.
 *
 * @typeParam Args - Arguments shape passed to the polling callback.
 * @typeParam Result - Result type produced by the polling callback.
 */
export function usePollingQuery<Args, Result>(
  args: Ref<Args>,
  queryFn: (args: Args, options: { signal: AbortSignal; pause: () => void }) => Promise<Result>,
  options: {
    minInterval: number;
    minDelay?: number;
    immediate?: boolean;
    immediateCallback?: boolean;
    pauseOnError?: boolean;
    maxInFlightRequests?: number;
    debounce?: number;
  },
) {
  const internal: InternalOptions = {
    minInterval: options.minInterval,
    minDelay: Math.max(0, options.minDelay ?? 0),
    immediate: options.immediate ?? true,
    immediateCallback: options.immediateCallback ?? false,
    pauseOnError: options.pauseOnError ?? false,
    maxInFlightRequests: Math.max(1, options.maxInFlightRequests ?? 1),
    debounce: Math.max(0, options.debounce ?? 0),
  };

  const canRun = internal.minInterval > 0;

  const data = shallowRef<PollingData<Result>>({ status: 'idle' });
  const lastError = ref<Error | null>(null);
  const isActive = ref(false);

  let latestVersion = 0;
  let argsVersion = 0;
  let inFlight = 0;
  let disposed = false;

  let scheduledTimeout: ReturnType<typeof setTimeout> | null = null;
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

  let nextMinIntervalStart = 0;
  let nextMinDelayStart = 0;

  const controllers = new Map<number, AbortController>();
  const abortReasons = new Map<number, AbortReason>();
  const waiters: Waiter[] = [];

  const markStale = () => {
    data.value = { ...data.value, status: 'stale' };
  };

  const scheduleWaiters = () => {
    if (waiters.length === 0) return;
    const waiter = waiters.shift();
    waiter?.resolve();
  };

  const waitForSlot = async () => {
    if (inFlight < internal.maxInFlightRequests) return;
    await new Promise<void>((resolve) => {
      waiters.push({ resolve });
    });
  };

  const clearScheduled = () => {
    if (scheduledTimeout !== null) {
      clearTimeout(scheduledTimeout);
      scheduledTimeout = null;
    }
  };

  const clearDebounce = () => {
    if (debounceTimeout !== null) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }
  };

  const abortAll = (reason: AbortReason) => {
    controllers.forEach((controller, version) => {
      if (!controller.signal.aborted) {
        abortReasons.set(version, reason);
        controller.abort();
      }
    });
  };

  const computeDelay = (requestedDelay = 0) => {
    const now = Date.now();
    const earliest = Math.max(nextMinIntervalStart, nextMinDelayStart);
    const baseDelay = earliest > now ? earliest - now : 0;
    return Math.max(0, requestedDelay, baseDelay);
  };

  const queueExecution = (requestedDelay = 0, source: ScheduleSource = ScheduleSource.Normal) => {
    if (!isActive.value || !canRun || disposed) return;
    const delay = computeDelay(requestedDelay);

    if (scheduledTimeout !== null) {
      clearTimeout(scheduledTimeout);
    }

    scheduledTimeout = setTimeout(() => {
      scheduledTimeout = null;
      void runExecution(source);
    }, delay);
  };

  const runExecution = async (source: ScheduleSource) => {
    if (!isActive.value || disposed || !canRun) return;

    const now = Date.now();
    const earliest = Math.max(nextMinIntervalStart, nextMinDelayStart);
    if (now < earliest) {
      queueExecution(earliest - now, source);
      return;
    }

    const argsSnapshot = args.value;
    const assignedArgsVersion = argsVersion;

    await waitForSlot();

    if (!isActive.value || disposed || !canRun) {
      scheduleWaiters();
      return;
    }

    const controller = new AbortController();
    const version = ++latestVersion;

    controllers.set(version, controller);
    inFlight += 1;

    const startTime = Date.now();
    nextMinIntervalStart = Math.max(nextMinIntervalStart, startTime + internal.minInterval);

    let pausedByCallback = false;

    const pauseFromCallback = () => {
      if (pausedByCallback) return;
      pausedByCallback = true;
      pause();
    };

    try {
      const result = await queryFn(argsSnapshot, { signal: controller.signal, pause: pauseFromCallback });
      if (!controller.signal.aborted) {
        if (version === latestVersion && assignedArgsVersion === argsVersion) {
          lastError.value = null;
          data.value = { status: 'synced', value: result };
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        // ignore abort errors
      } else {
        if (version === latestVersion) {
          lastError.value = toError(error);
        }

        if (internal.pauseOnError) {
          pause();
        }
      }
    } finally {
      const finishTime = Date.now();
      nextMinDelayStart = Math.max(nextMinDelayStart, finishTime + internal.minDelay);

      controllers.delete(version);
      inFlight = Math.max(0, inFlight - 1);
      scheduleWaiters();

      const reason = abortReasons.get(version);
      if (reason) {
        abortReasons.delete(version);
      }

      const shouldSchedule
        = isActive.value && !disposed && reason !== 'args';

      if (shouldSchedule) {
        queueExecution();
      }
    }
  };

  const triggerExecution = (source: ScheduleSource = ScheduleSource.External) => {
    if (!isActive.value || disposed || !canRun) return;
    queueExecution(0, source);
  };

  const handleArgsChange = () => {
    argsVersion += 1;
    markStale();
    abortAll('args');

    if (!isActive.value || !canRun) {
      return;
    }

    const schedule = () => {
      triggerExecution(ScheduleSource.External);
    };

    if (internal.debounce > 0) {
      clearDebounce();
      debounceTimeout = setTimeout(() => {
        debounceTimeout = null;
        schedule();
      }, internal.debounce);
    } else {
      schedule();
    }
  };

  const pause = () => {
    if (!isActive.value) return;
    isActive.value = false;
    clearScheduled();
    clearDebounce();
    abortAll('pause');
    nextMinIntervalStart = Date.now();
    nextMinDelayStart = Date.now();
  };

  const resume = () => {
    if (!canRun) return;
    if (isActive.value) return;
    isActive.value = true;
    lastError.value = null;

    const now = Date.now();
    nextMinIntervalStart = now;
    nextMinDelayStart = now;

    if (internal.immediateCallback) {
      triggerExecution(ScheduleSource.External);
    } else {
      queueExecution(internal.minInterval, ScheduleSource.External);
    }
  };

  onScopeDispose(() => {
    disposed = true;
    clearScheduled();
    clearDebounce();
    abortAll('dispose');
    isActive.value = false;
    waiters.splice(0, waiters.length).forEach(({ resolve }) => resolve());
  });

  watch(args, handleArgsChange, { flush: 'sync' });

  if (internal.immediate && canRun) {
    resume();
  }

  return {
    data: readonly(data),
    lastError: readonly(lastError),
    isActive: readonly(isActive),
    pause,
    resume,
  };
}
