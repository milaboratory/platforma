export class Aborted extends Error {
  constructor(cause: unknown) {
    super('aborted', { cause });
  }
}

export function sleep(timeout: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timeoutRef: NodeJS.Timeout;
    let abortHandler = () => {
      clearTimeout(timeoutRef);
      reject(new Aborted(abortSignal?.reason));
    };
    if (abortSignal?.aborted)
      reject(new Aborted(abortSignal.reason));
    timeoutRef = setTimeout(() => {
      abortSignal?.removeEventListener('abort', abortHandler);
      resolve();
    }, timeout);
    abortSignal?.addEventListener('abort', abortHandler);
  });
}

export interface JitterOpts {
  ms: number;
  factor: number;
}

/** jitterSleep sleeps for a random time defined by ms and factor.
 * For example, if factor == 0.1, then the jitter will
 * sleep for any time between ms * 0.9 and ms * 1.1. */
export function jitterSleep({ ms, factor }: JitterOpts) {
  const rangeMinusOneOne = 2 * (Math.random() - 0.5);
  return sleep(rangeMinusOneOne * factor * ms);
}
