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
