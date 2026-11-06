/** Placeholder that replaces secret values in logged or thrown structures. */
export const REDACTED = "***";

/** Keys whose values are credentials: plPassword, plJwt, jwt, minioPassword,
 * MINIO_ROOT_PASSWORD, secret, token, proxy auth and alike. */
const secretKey = /pass(word|wd)|secret|token|jwt|^auth$|authorization/i;

/** Returns a deep copy of `value` with the values of secret-looking keys
 * replaced by {@link REDACTED}. Meant for logs and error messages only:
 * the input is not modified, so the real values stay usable. */
export function redactSecrets(value: unknown): unknown {
  return redact(value, new WeakSet());
}

function redact(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) return value.map((v) => redact(v, seen));
  if ("toJSON" in value && typeof value.toJSON === "function") return value;

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    result[k] = secretKey.test(k) && v !== undefined && v !== null ? REDACTED : redact(v, seen);
  }
  return result;
}

/** `JSON.stringify` for logs and error messages: secrets are redacted. */
export function stringifyRedacted(value: unknown): string {
  return JSON.stringify(redactSecrets(value));
}
