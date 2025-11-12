import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { effectScope } from 'vue';
import { useAsyncPolling } from '../../composition/useAsyncPolling';

describe('useAsyncPolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('basic functionality', () => {
    it('should execute callback repeatedly at specified interval', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      const { isActive } = useAsyncPolling(callback, { minInterval: 100 });

      expect(isActive.value).toBe(true);
      expect(callback).toHaveBeenCalledTimes(0);

      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('should pass AbortSignal to callback', async () => {
      const callback = vi.fn(async ({ signal }: { signal: AbortSignal }) => {
        expect(signal).toBeInstanceOf(AbortSignal);
        expect(signal.aborted).toBe(false);
      });

      useAsyncPolling(callback, { minInterval: 100 });

      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should not start when immediate is false', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      const { isActive } = useAsyncPolling(callback, { minInterval: 100, immediate: false });

      expect(isActive.value).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      expect(callback).toHaveBeenCalledTimes(0);
    });

    it('should not work when minInterval is negative or zero', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      const { isActive, resume } = useAsyncPolling(callback, { minInterval: -1, immediate: false });

      resume();
      expect(isActive.value).toBe(false);
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(0);
    });
  });

  describe('pause and resume', () => {
    it('should pause and resume polling', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      const { isActive, pause, resume } = useAsyncPolling(callback, { minInterval: 100 });

      expect(isActive.value).toBe(true);

      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(1);

      pause();
      expect(isActive.value).toBe(false);

      await vi.advanceTimersByTimeAsync(200);
      expect(callback).toHaveBeenCalledTimes(1);

      resume();
      expect(isActive.value).toBe(true);

      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should provide pause function in callback options', async () => {
      const callback = vi.fn(async ({ pause }: { pause: () => void }) => {
        expect(typeof pause).toBe('function');
      });

      useAsyncPolling(callback, { minInterval: 100 });

      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should allow pausing from within callback', async () => {
      let shouldPauseInCallback = false;
      const callback = vi.fn(async ({ pause }: { pause: () => void }) => {
        if (shouldPauseInCallback) {
          pause();
        }
      });

      const { isActive } = useAsyncPolling(callback, { minInterval: 100 });

      // First call - don't pause
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(isActive.value).toBe(true);

      // Second call - don't pause
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(2);
      expect(isActive.value).toBe(true);

      // Third call - pause from within callback
      shouldPauseInCallback = true;
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(3);
      expect(isActive.value).toBe(false);

      // Should not call again
      await vi.advanceTimersByTimeAsync(200);
      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('should allow conditional pausing based on callback result', async () => {
      let counter = 0;
      const callback = vi.fn(async ({ pause }: { pause: () => void }) => {
        counter++;
        if (counter >= 3) {
          pause();
        }
      });

      const { isActive } = useAsyncPolling(callback, { minInterval: 100 });

      expect(isActive.value).toBe(true);

      // Call 1
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(isActive.value).toBe(true);

      // Call 2
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(2);
      expect(isActive.value).toBe(true);

      // Call 3 - should pause
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(3);
      expect(isActive.value).toBe(false);

      // Should not call again
      await vi.advanceTimersByTimeAsync(200);
      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('should abort callback when paused during execution', async () => {
      let capturedSignal: AbortSignal | undefined;

      const callback = vi.fn(async ({ signal }: { signal: AbortSignal }) => {
        capturedSignal = signal;
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const { pause } = useAsyncPolling(callback, { minInterval: 100 });

      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(capturedSignal?.aborted).toBe(false);

      pause();
      expect(capturedSignal?.aborted).toBe(true);
    });

    it('should clear lastError when resume is called', async () => {
      const error = new Error('Test error');
      const callback = vi.fn().mockRejectedValue(error);

      const { lastError, pause, resume } = useAsyncPolling(callback, { minInterval: 100 });

      await vi.advanceTimersByTimeAsync(100);
      expect(lastError.value).toBe(error);

      pause();
      resume();
      expect(lastError.value).toBe(null);
    });
  });

  describe('immediateCallback option', () => {
    it('should execute callback immediately on resume when immediateCallback is true', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      const { isActive } = useAsyncPolling(callback, { minInterval: 100, immediateCallback: true });

      expect(isActive.value).toBe(true);

      // Let immediate callback execute
      await vi.advanceTimersByTimeAsync(0);
      expect(callback).toHaveBeenCalledTimes(1);

      // Next callback after minInterval
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should execute callback immediately when resume is called with immediateCallback', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      const { pause, resume } = useAsyncPolling(callback, {
        minInterval: 100,
        immediateCallback: true,
        immediate: false,
      });

      expect(callback).toHaveBeenCalledTimes(0);

      resume();
      await vi.advanceTimersByTimeAsync(0);
      expect(callback).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(2);

      pause();
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(2);

      resume();
      await vi.advanceTimersByTimeAsync(0);
      expect(callback).toHaveBeenCalledTimes(3);
    });
  });

  describe('timing with minInterval', () => {
    it('should respect minInterval based on start time of callback', async () => {
      const callback = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
      });

      useAsyncPolling(callback, { minInterval: 100 });

      // Start first callback at t=100
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(1);

      // Callback takes 60ms to complete (t=160)
      // Next call should be at t=200 (100ms from start of first call)
      // So we need to wait 40ms more after callback completes
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should schedule next call immediately after completion if callback exceeds minInterval', async () => {
      const callback = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      useAsyncPolling(callback, { minInterval: 100 });

      // Start first callback at t=100
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(1);

      // Callback takes 150ms, finishes at t=250
      // minInterval is 100, elapsed is 150, so max(100-150, 0) = 0
      // Next call should happen immediately (at t=250), need small advance to trigger it
      await vi.advanceTimersByTimeAsync(151);
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe('timing with minDelay', () => {
    it('should respect minDelay after callback completion', async () => {
      const callback = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      useAsyncPolling(callback, { minInterval: 100, minDelay: 50 });

      // Start first callback at t=100
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(1);

      // Callback takes 30ms, completes at t=130
      // max(100-30, 50) = max(70, 50) = 70
      // Next call at t=200
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should use max(minInterval - elapsed, minDelay) for scheduling', async () => {
      const callback = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
      });

      useAsyncPolling(callback, { minInterval: 100, minDelay: 20 });

      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(40);

      await vi.advanceTimersByTimeAsync(60);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should use minDelay when callback exceeds minInterval', async () => {
      const callback = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
      });

      useAsyncPolling(callback, { minInterval: 100, minDelay: 30 });

      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(150);

      await vi.advanceTimersByTimeAsync(29);
      expect(callback).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('should store error in lastError', async () => {
      const error = new Error('Test error');
      const callback = vi.fn().mockRejectedValue(error);

      const { lastError } = useAsyncPolling(callback, { minInterval: 100 });

      await vi.advanceTimersByTimeAsync(100);
      expect(lastError.value).toBe(error);
    });

    it('should clear lastError on successful execution', async () => {
      const error = new Error('Test error');
      let shouldFail = true;
      const callback = vi.fn(async () => {
        if (shouldFail) {
          throw error;
        }
      });

      const { lastError } = useAsyncPolling(callback, { minInterval: 100 });

      await vi.advanceTimersByTimeAsync(100);
      expect(lastError.value).toBe(error);

      shouldFail = false;
      await vi.advanceTimersByTimeAsync(100);
      expect(lastError.value).toBe(null);
    });

    it('should continue polling after error by default', async () => {
      const error = new Error('Test error');
      const callback = vi.fn().mockRejectedValue(error);

      const { isActive } = useAsyncPolling(callback, { minInterval: 100 });

      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(isActive.value).toBe(true);

      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(2);
      expect(isActive.value).toBe(true);
    });

    it('should convert non-Error values to Error objects', async () => {
      const callback = vi.fn().mockRejectedValue('string error');

      const { lastError } = useAsyncPolling(callback, { minInterval: 100 });

      await vi.advanceTimersByTimeAsync(100);
      expect(lastError.value).toBeInstanceOf(Error);
      expect(lastError.value?.message).toBe('string error');
    });
  });

  describe('pauseOnError option', () => {
    it('should pause polling when error occurs with pauseOnError=true', async () => {
      const error = new Error('Test error');
      const callback = vi.fn().mockRejectedValue(error);

      const { isActive, lastError } = useAsyncPolling(callback, { minInterval: 100, pauseOnError: true });

      expect(isActive.value).toBe(true);

      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(isActive.value).toBe(false);
      expect(lastError.value).toBe(error);

      await vi.advanceTimersByTimeAsync(200);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should pause on immediateCallback error with pauseOnError=true', async () => {
      const error = new Error('Immediate error');
      const callback = vi.fn().mockRejectedValue(error);

      const { isActive, lastError } = useAsyncPolling(callback, {
        minInterval: 100,
        immediateCallback: true,
        pauseOnError: true,
      });

      expect(isActive.value).toBe(true);

      await vi.runAllTimersAsync();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(isActive.value).toBe(false);
      expect(lastError.value).toBe(error);

      await vi.advanceTimersByTimeAsync(200);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should allow resuming after pauseOnError', async () => {
      const error = new Error('Test error');
      let shouldFail = true;
      const callback = vi.fn(async () => {
        if (shouldFail) {
          throw error;
        }
      });

      const { isActive, lastError, resume } = useAsyncPolling(callback, {
        minInterval: 100,
        pauseOnError: true,
      });

      await vi.advanceTimersByTimeAsync(100);
      expect(isActive.value).toBe(false);
      expect(lastError.value).toBe(error);

      shouldFail = false;
      resume();
      expect(isActive.value).toBe(true);
      expect(lastError.value).toBe(null);

      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(2);
      expect(isActive.value).toBe(true);
      expect(lastError.value).toBe(null);
    });
  });

  describe('scope disposal', () => {
    it('should stop polling when scope is disposed', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);
      const scope = effectScope();

      await scope.run(async () => {
        const { isActive } = useAsyncPolling(callback, { minInterval: 100 });
        expect(isActive.value).toBe(true);

        await vi.advanceTimersByTimeAsync(100);
        expect(callback).toHaveBeenCalledTimes(1);
      });

      callback.mockClear();
      await scope.stop();

      await vi.advanceTimersByTimeAsync(200);
      expect(callback).toHaveBeenCalledTimes(0);
    });

    it('should abort callback when scope is disposed during execution', async () => {
      let capturedSignal: AbortSignal | undefined;
      const callback = vi.fn(async ({ signal }: { signal: AbortSignal }) => {
        capturedSignal = signal;
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const scope = effectScope();

      await scope.run(async () => {
        useAsyncPolling(callback, { minInterval: 100 });
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(capturedSignal?.aborted).toBe(false);
      await scope.stop();
      expect(capturedSignal?.aborted).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle pause called during callback execution', async () => {
      const callback = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      const { isActive, pause } = useAsyncPolling(callback, { minInterval: 100 });

      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(1);

      pause();
      await vi.advanceTimersByTimeAsync(50);

      expect(isActive.value).toBe(false);
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle resume called while callback is executing', async () => {
      let resolveCallback: (() => void) | undefined;
      const callback = vi.fn(
        async () =>
          new Promise<void>((resolve) => {
            resolveCallback = resolve;
          }),
      );

      const { pause, resume } = useAsyncPolling(callback, { minInterval: 100 });

      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(1);

      // Pause aborts the current callback
      pause();

      // Resume starts a new polling cycle
      resume();

      // The first callback should have been aborted, resolve it anyway
      resolveCallback?.();

      // The new cycle should schedule at minInterval
      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple pause/resume cycles', async () => {
      const callback = vi.fn().mockResolvedValue(undefined);

      const { isActive, pause, resume } = useAsyncPolling(callback, { minInterval: 100 });

      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(1);

      pause();
      expect(isActive.value).toBe(false);
      resume();
      expect(isActive.value).toBe(true);

      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(2);

      pause();
      resume();
      pause();
      resume();

      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('should not schedule next iteration if paused during callback', async () => {
      let shouldPause = false;
      const callback = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });

      const { pause } = useAsyncPolling(callback, { minInterval: 100 });

      await vi.advanceTimersByTimeAsync(100);
      expect(callback).toHaveBeenCalledTimes(1);

      shouldPause = true;
      await vi.advanceTimersByTimeAsync(100);

      if (shouldPause) {
        pause();
      }

      await vi.advanceTimersByTimeAsync(200);
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });
});
