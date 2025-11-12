import { shallowRef, shallowReadonly, onScopeDispose } from 'vue';

export interface UseAsyncPollingOptions {
  /**
   * Minimum interval between the start of consecutive callback executions (in milliseconds).
   * The next iteration will be scheduled for at least this duration after the previous one started,
   * taking into account the actual execution time.
   */
  minInterval: number;

  /**
   * Optional minimum delay after callback completion before starting the next iteration (in milliseconds).
   * The next iteration will be scheduled for `max(minInterval - elapsed, minDelay)` after callback completes.
   * @default undefined
   */
  minDelay?: number;

  /**
   * Start polling immediately when the composable is created.
   * @default true
   */
  immediate?: boolean;

  /**
   * Execute the callback immediately when calling `resume()`, before starting the polling interval.
   * If the immediate callback throws and `pauseOnError` is true, polling will not start.
   * @default false
   */
  immediateCallback?: boolean;

  /**
   * Automatically pause polling when the callback throws an error.
   * When enabled and an error occurs, `isActive` becomes false and the error is stored in `lastError`.
   * @default false
   */
  pauseOnError?: boolean;
}

export interface UseAsyncPollingReturn {
  /**
   * Whether polling is currently active.
   */
  isActive: Readonly<ReturnType<typeof shallowRef<boolean>>>;

  /**
   * The last error that occurred during callback execution, or null if no error or after successful execution.
   * Also cleared when `resume()` is called.
   */
  lastError: Readonly<ReturnType<typeof shallowRef<Error | null>>>;

  /**
   * Pause the polling. This will:
   * - Set isActive to false
   * - Clear any pending timeout
   * - Abort the currently running callback (if any) via AbortController
   */
  pause: () => void;

  /**
   * Resume or start the polling. This will:
   * - Set isActive to true
   * - Clear lastError
   * - Execute the callback immediately if immediateCallback is true
   * - Schedule the next iteration
   */
  resume: () => void;
}

/**
 * Async polling composable that repeatedly executes an async callback with configurable timing and error handling.
 *
 * Unlike `setInterval`, this uses `setTimeout` and waits for each callback to complete before scheduling the next one.
 * This prevents overlapping executions and allows for adaptive timing based on execution duration.
 *
 * @example
 * ```typescript
 * const { isActive, pause, resume, lastError } = useAsyncPolling(
 *   async ({ signal, pause }) => {
 *     const response = await fetch('/api/status', { signal });
 *     if (response.status === 404) {
 *       pause(); // Stop polling if resource not found
 *       return;
 *     }
 *     // Process response
 *   },
 *   {
 *     minInterval: 5000,     // Start polling every 5 seconds
 *     minDelay: 1000,        // Wait at least 1 second after completion
 *     pauseOnError: true,    // Stop on errors
 *     immediate: true        // Start immediately
 *   }
 * );
 * ```
 *
 * **Timing Behavior:**
 * - `minInterval` ensures at least N milliseconds between callback start times
 * - `minDelay` ensures at least M milliseconds after callback completion
 * - Next iteration scheduled for: `max(minInterval - elapsed, minDelay ?? 0)` after completion
 * - If callback takes longer than minInterval, next iteration starts after minDelay (if specified)
 *
 * **AbortController Integration:**
 * - A new AbortController is created for each callback invocation
 * - The signal is passed via the callback's options parameter: `{ signal }`
 * - Signal is aborted when: pausing, resuming (cancels pending), or component unmounts
 * - Use the signal in fetch calls or check `signal.aborted` for manual cancellation
 *
 * **Error Handling:**
 * - Errors are caught and stored in `lastError` ref
 * - `lastError` is cleared on successful execution or when `resume()` is called
 * - If `pauseOnError: true`, polling stops automatically on error (including immediate callback)
 * - Otherwise, polling continues despite errors
 *
 * **Pausing from Callback:**
 * - The `pause` function is provided in the callback options for easy access
 * - Call `pause()` from within the callback to stop polling based on conditions
 * - No need to capture the returned `pause` function separately
 *
 * @param cb - Async callback function that receives `{ signal: AbortSignal, pause: () => void }` and returns a Promise
 * @param options - Configuration options for polling behavior
 * @returns Object with `isActive`, `lastError`, `pause`, and `resume` controls
 */
export function useAsyncPolling(
  cb: (options: { signal: AbortSignal; pause: () => void }) => Promise<void>,
  options: UseAsyncPollingOptions,
): UseAsyncPollingReturn {
  const { minInterval, minDelay, immediate = true, immediateCallback = false, pauseOnError = false } = options;

  const isActive = shallowRef(false);
  const lastError = shallowRef<Error | null>(null);
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let abortController: AbortController | null = null;

  function cleanup() {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (abortController !== null) {
      abortController.abort();
      abortController = null;
    }
  }

  function pause() {
    isActive.value = false;
    cleanup();
  }

  async function executeCallback() {
    if (!isActive.value) return;

    const startTime = Date.now();
    abortController = new AbortController();
    const currentController = abortController;

    try {
      await cb({ signal: currentController.signal, pause });
      lastError.value = null;
    } catch (err) {
      lastError.value = err instanceof Error ? err : new Error(String(err));
      if (pauseOnError) {
        pause();
        return;
      }
    }

    // Check if we should continue - might have been paused or aborted during callback
    if (!isActive.value || currentController !== abortController) {
      return;
    }

    const elapsed = Date.now() - startTime;
    const delay = Math.max(minInterval - elapsed, minDelay ?? 0);

    timeoutId = setTimeout(() => {
      void executeCallback();
    }, delay);
  }

  function resume() {
    if (minInterval <= 0) return;

    cleanup();
    isActive.value = true;
    lastError.value = null;

    if (immediateCallback) {
      void executeCallback();
    } else {
      timeoutId = setTimeout(() => {
        void executeCallback();
      }, minInterval);
    }
  }

  if (immediate) {
    resume();
  }

  onScopeDispose(pause);

  return {
    isActive: shallowReadonly(isActive),
    lastError: shallowReadonly(lastError),
    pause,
    resume,
  };
}
