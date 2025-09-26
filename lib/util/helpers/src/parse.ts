/**
 * Supports values like: "15000", "15s", "2m", "1h", "500ms".
 */
export function parseDurationMs(value: string | undefined, fallback: number): number {
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

/**
 * Supports values like: "15000", "15", "2", "1", "500".
 */
export function parseInt(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/**
 * Supports values like: "true", "false", "1", "0", "yes", "no", "on", "off".
 */
export function parseBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes' || v === 'on') return true;
    if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  }
  return typeof value === 'boolean' ? value : fallback;
}
