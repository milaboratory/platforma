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

const quoted = String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'`;

const stringRules: [RegExp, string | ((...m: string[]) => string)][] = [
  // scheme://user:password@host, the password running to the last `@` (it may hold `@`)
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:@/]*):[^\s/]*@/gi, `$1:${REDACTED}@`],
  // ?token=… &password=… in a URL inside text, the value running to `&`, `#`,
  // whitespace or `"` (a JSON string's end); a whole-string URL goes through redactUrl
  [new RegExp(String.raw`([?&]${secretName})=[^&#\s"]*`, "gi"), `$1=${REDACTED}`],
  // Authorization: Bearer …
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/g, `$1 ${REDACTED}`],
  // TOKEN=…, --jwt=…, password: …, "plPassword": … (env entries, CLI flags, YAML, JSON);
  // a quoted value is masked whole, an unquoted one up to whitespace or `,;&`
  [
    new RegExp(
      String.raw`(^|[\s;,:'"(\[{])("?${secretName}"?\s*(?:=|:\s*))(${quoted}|(?!(?:Bearer|Basic) )[^\s,;&]+)`,
      "gi",
    ),
    (_, before: string, name: string, value: string) => {
      const q = value[0] === '"' || value[0] === "'" ? value[0] : "";
      return `${before}${name}${q}${REDACTED}${q}`;
    },
  ],
];

/** Masks credentials that appear in free text: URL user info, secret query
 * parameters, `KEY=value` pairs and JSON fragments with secret keys. */
export function redactString(text: string): string {
  let result = isWholeUrl(text) ? redactUrlText(text) : text;
  for (const [re, replacement] of stringRules) {
    // two calls only to pick the right `replace` overload
    result =
      typeof replacement === "string"
        ? result.replace(re, replacement)
        : result.replace(re, replacement);
  }
  return result;
}

const urlStart = /^[a-z][a-z0-9+.-]*:\/\//i;
const secretParam = new RegExp(String.raw`^${secretName}$`, "i");

function isWholeUrl(text: string): boolean {
  return urlStart.test(text) && !/\s/.test(text) && URL.canParse(text);
}

/** Masks the password and secret-named query values of a string that is one whole
 * URL, whatever characters they hold, keeping the rest of the text as written.
 * Splits as WHATWG URL does: the authority ends at the first `/`, `?` or `#`, and the
 * user info at the last `@` in it; the query runs from `?` to `#`, split on `&`. */
function redactUrlText(text: string): string {
  const afterScheme = text.indexOf("://") + 3;
  const authorityEnd = text.slice(afterScheme).search(/[/?#]|$/) + afterScheme;
  const at = text.lastIndexOf("@", authorityEnd - 1);
  let result = text;
  if (at >= afterScheme) {
    const colon = text.indexOf(":", afterScheme);
    if (colon !== -1 && colon < at) result = text.slice(0, colon + 1) + REDACTED + text.slice(at);
  }

  const q = result.indexOf("?");
  if (q === -1) return result;
  const hash = result.indexOf("#", q);
  const end = hash === -1 ? result.length : hash;
  const query = result
    .slice(q + 1, end)
    .split("&")
    .map((part) => {
      const eq = part.indexOf("=");
      return eq !== -1 && secretParam.test(part.slice(0, eq))
        ? `${part.slice(0, eq + 1)}${REDACTED}`
        : part;
    })
    .join("&");
  return `${result.slice(0, q + 1)}${query}${result.slice(end)}`;
}

/** Serializes a URL with its password and secret-named query values masked,
 * whatever characters they hold. Uses the built-in URL methods only. */
function redactUrl(url: URL): string {
  const copy = new URL(URL.prototype.toString.call(url));
  if (copy.password) copy.password = REDACTED;
  for (const name of new Set(copy.searchParams.keys())) {
    if (secretParam.test(name)) copy.searchParams.set(name, REDACTED);
  }
  return copy.toString();
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

    // No method of the value is called, as an override may change the original or
    // throw: Date and URL go through the built-in prototype methods, other objects
    // through their own properties.
    if (value instanceof Date || value instanceof URL) return serializeBuiltin(value);

    const result: Record<string, unknown> = {};
    for (const k of Object.keys(value)) {
      let v: unknown;
      try {
        v = Reflect.get(value, k);
      } catch {
        result[k] = "[unreadable]";
        continue;
      }
      if (typeof v === "function") continue;
      result[k] =
        secretKey.test(k) && v !== undefined && v !== null ? REDACTED : redact(v, ancestors);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function serializeBuiltin(value: Date | URL): string {
  try {
    return value instanceof Date
      ? Date.prototype.toISOString.call(value)
      : redactString(redactUrl(value));
  } catch {
    return "[unserializable]";
  }
}

/** `JSON.stringify` for logs and error messages: secrets are redacted. */
export function stringifyRedacted(value: unknown): string {
  return JSON.stringify(redactSecrets(value));
}
