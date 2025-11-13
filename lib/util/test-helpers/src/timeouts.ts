import { parseDurationMs } from '@milaboratories/helpers';

export function getLongTestTimeout(fallback = 60_000): number {
  return parseDurationMs(process.env.LONG_TEST_TIMEOUT, fallback);
}

export const LONG_TEST_TIMEOUT = getLongTestTimeout();
