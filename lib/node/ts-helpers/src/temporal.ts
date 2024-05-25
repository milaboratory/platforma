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

/** Returns for a random time defined by ms and factor.
 * For example, if factor == 0.1, then the jitter will
 * return any time between ms * 0.9 and ms * 1.1. */
export function jitter({ ms, factor }: JitterOpts): number {
  const rangeMinusOneOne = 2 * (Math.random() - 0.5);
  return ms + rangeMinusOneOne * factor * ms;
}

export type ExponentialBackoffRetryOptions = {
  type: 'exponentialBackoff',
  /** Max attempts */
  maxAttempts: number,
  /** Delay after first failed attempt */
  initialDelay: number,
  /** Each time delay will be multiplied by this number (1.5 means plus on 50% each attempt) */
  backoffMultiplier: number,
  /** Value from 0 to 1, determine level of randomness to introduce to the backoff delays sequence. (0 meaning no randomness) */
  jitter: number
}

export type LinearBackoffRetryOptions = {
  type: 'linearBackoff',
  /** Max attempts */
  maxAttempts: number,
  /** Delay after first failed attempt */
  initialDelay: number,
  /** This value will be added to the delay from the previous step */
  backoffStep: number,
  /** Value from 0 to 1, determine level of randomness to introduce to the backoff delays sequence. (0 meaning no randomness) */
  jitter: number
}

export type RetryOptions = LinearBackoffRetryOptions | ExponentialBackoffRetryOptions;

export type RetryState = {
  options: RetryOptions,
  attemptsLeft: number,
  startTimestamp: number,
  totalDelay: number,
  nextDelay: number
}

export function createRetryState(options: RetryOptions): RetryState {
  return {
    options,
    attemptsLeft: options.maxAttempts - 1,
    nextDelay: options.initialDelay,
    totalDelay: options.initialDelay,
    startTimestamp: Date.now()
  };
}

export function tryNextRetryState(previous: RetryState): RetryState | undefined {
  if (previous.attemptsLeft <= 0)
    return undefined;
  let delayDelta = previous.options.type == 'linearBackoff'
    ? previous.options.backoffStep
    : (previous.nextDelay * (previous.options.backoffMultiplier - 1));
  delayDelta += delayDelta * previous.options.jitter * 2 * (Math.random() - 0.5);
  return {
    options: previous.options,
    nextDelay: previous.nextDelay + delayDelta,
    attemptsLeft: previous.attemptsLeft - 1,
    startTimestamp: previous.startTimestamp,
    totalDelay: previous.totalDelay + previous.nextDelay + delayDelta
  };
}

export function nextRetryStateOrError(previous: RetryState): RetryState {
  const next = tryNextRetryState(previous);
  if (next === undefined)
    throw new Error(`reached max number of attempts reached (${previous.options.maxAttempts}): ` +
      `total time = ${msToHumanReadable(Date.now() - previous.startTimestamp)}, total delay = ${msToHumanReadable(previous.totalDelay)}`);
  return next;
}

function msToHumanReadable(ms: number): string {
  let seconds = ms / 1000;
  let minutes = ms / (1000 * 60);
  let hours = ms / (1000 * 60 * 60);
  let days = ms / (1000 * 60 * 60 * 24);
  if (ms < 1000) return `${ms}ms`;
  if (seconds < 120) return `${seconds.toPrecision(3)}s`;
  else if (minutes < 120) return `${minutes.toPrecision(3)}m`;
  else if (hours < 24) return `${hours.toPrecision(3)}h`;
  else return `${days.toPrecision(3)}d`;
}
