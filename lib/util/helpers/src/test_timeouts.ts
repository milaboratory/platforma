import { parseDurationMs } from './parse';

export function getTestTimeout(fallback = 60_000): number {
  return parseDurationMs(process.env.TEST_TIMEOUT, fallback);
}

export const TEST_TIMEOUT = getTestTimeout();
