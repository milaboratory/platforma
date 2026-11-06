/** Placeholder that replaces secret values in logged or thrown text. */
export const REDACTED = "***";

/** Object keys whose values are credentials: plPassword, plJwt, jwt, minioPassword,
 * MINIO_ROOT_PASSWORD, secret, token, proxy auth and alike. */
const secretKey = /pass(word|wd)|secret|token|jwt|^auth$|authorization/i;

/** Names that mark a secret inside free text: query parameters, `KEY=value`
 * pairs (environment entries, CLI flags) and JSON fragments. Broader than
 * {@link secretKey} (adds `auth*` and `key`): a false positive in text only
 * costs one logged value. */
const secretName = String.raw`[\w.-]*(?:pass(?:word|wd)|secret|token|jwt|auth|key)[\w.-]*`;

const stringRules: [RegExp, string][] = [
  // scheme://user:password@host
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:@/]*):[^\s@/]*@/gi, `$1:${REDACTED}@`],
  // ?token=… &password=… NAME_TOKEN=… --jwt=…
  [
    new RegExp(String.raw`(^|[\s?&;:,'"(\[{])(${secretName})=[^\s&;,'")\]}]*`, "gi"),
    `$1$2=${REDACTED}`,
  ],
  // "plPassword": "…" or "plPassword": unquoted (as in JSON parse error snippets)
  [
    new RegExp(String.raw`("${secretName}"\s*:\s*)(?:"(?:[^"\\]|\\.)*"|[^\s,}\]"]+)`, "gi"),
    `$1"${REDACTED}"`,
  ],
  // Authorization: Bearer …
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/g, `$1 ${REDACTED}`],
];

/** Masks credentials that appear in free text: URL user info, secret query
 * parameters, `KEY=value` pairs and JSON fragments with secret keys. */
export function redactString(text: string): string {
  return stringRules.reduce((s, [re, replacement]) => s.replace(re, replacement), text);
}

/** Text of a caught error (or any thrown value) with credentials masked,
 * for interpolation into log lines and new error messages. */
export function redactError(e: unknown): string {
  return redactString(String(e));
}

/** Returns a deep copy of `value` with the values of secret-looking keys
 * replaced by {@link REDACTED} and every string passed through {@link redactString}.
 * Meant for logs and error messages only: the input is not modified, so the
 * real values stay usable. */
export function redactSecrets(value: unknown): unknown {
  return redact(value, new Set());
}

/** `ancestors` holds the objects on the current path only, so a shared
 * (non-cyclic) reference is copied in full and only a real cycle is cut. */
function redact(value: unknown, ancestors: Set<object>): unknown {
  if (typeof value === "string") return redactString(value);
  if (typeof value !== "object" || value === null) return value;
  if (ancestors.has(value)) return "[Circular]";

  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((v) => redact(v, ancestors));

    if ("toJSON" in value && typeof value.toJSON === "function") {
      let json: unknown;
      try {
        json = value.toJSON();
      } catch {
        return "[toJSON failed]";
      }
      if (json !== value) return redact(json, ancestors);
    }

    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "function") continue;
      result[k] =
        secretKey.test(k) && v !== undefined && v !== null ? REDACTED : redact(v, ancestors);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

/** `JSON.stringify` for logs and error messages: secrets are redacted. */
export function stringifyRedacted(value: unknown): string {
  return JSON.stringify(redactSecrets(value));
}
