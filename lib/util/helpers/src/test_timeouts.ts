/**
 * Supports values like: "15000", "15s", "2m", "1h", "500ms".
 */
function parseDuration(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const v = value.trim().toLowerCase();
  const m = v.match(/^(\d+)(ms|s|m|h)?$/);
  if (!m) return fallback;

  const n = Number(m[1]);
  const unit = m[2] as 'ms' | 's' | 'm' | 'h' | undefined;

  switch (unit) {
    case 'ms': return n;
    case 's': return n * 1_000;
    case 'm': return n * 60_000;
    case 'h': return n * 3_600_000;
    default: return n; // no suffix — treat as milliseconds
  }
}

export function getTestTimeout(fallback = 60_000): number {
  return parseDuration(process.env.TEST_TIMEOUT, fallback);
}

export const TEST_TIMEOUT = getTestTimeout();
