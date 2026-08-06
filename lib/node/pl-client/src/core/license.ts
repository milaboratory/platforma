/**
 * Monitoring mode for a single telemetry channel, as encoded in the license.
 *
 * See https://github.com/milaboratory/text/blob/main/features/monitoring/platforma-monitoring-prd.md
 */
export type LicenseMonitoringMode = "with_id" | "no_id" | "none";

/**
 * License payload — the decoded body of a Platforma license token.
 *
 * The token is issued by the licensing server (milm2) and returned to clients
 * verbatim by the backend's Maintenance API — see {@link PlClient.license}. The
 * token has the form `I.<base64Payload>.<watermark>.<signature>`; this type
 * describes the JSON found in `<base64Payload>` once base64-decoded (via
 * {@link decodeLicenseToken}).
 *
 * Issuer reference: https://github.com/milaboratory/milm2/blob/master/src/types/index.ts
 * Backend counterpart: `core/pl/cmd/platforma/license.go` (`License` struct).
 */
export interface LicensePayload {
  /** Unix timestamp (seconds) the license itself is valid from (issuance), not a token time. */
  v: number;
  /**
   * Unix timestamp (seconds) this license token expires after — the token's
   * TTL, not the license's own validity period. Tokens are short-lived and
   * re-minted (e.g. a 24h TTL yields `e` = issued-at + 86400) even when the
   * underlying license is valid far longer, so `e` is not the license
   * expiration date.
   */
  e: number;
  /**
   * [optional] Unix timestamp (seconds) the license itself expires — the
   * underlying license/contract end date, independent of the short-lived
   * token TTL `e`. Derived from the contract expiration before any token-TTL
   * clamping, so this is the field to use when reasoning about whether the
   * license (not the current token) has expired. Absent on tokens from older
   * licensing servers that predate the `le` claim.
   */
  le?: number;
  /** UID of the customer. */
  u: string;
  /** Metric marker — attached to usage statistics. */
  m: string;
  /** [optional] Fallback license code, used once the license has expired. */
  l?: string;
  /** [optional] Unix timestamp (seconds); warn the user about expiration after this moment. */
  w?: number;
  /** [optional] Warning text; if `w` is set while `wt` is absent, a default warning should be shown. */
  wt?: string;
  /** [optional] Expiration text — shown to the user once the license has expired. */
  et?: string;
  c?: Record<string, unknown>;
  t?: Record<string, unknown>;
  hw?: string;
  f?: Record<string, string>;
  /**
   * Monitoring configuration.
   * https://github.com/milaboratory/text/blob/main/features/monitoring/platforma-monitoring-prd.md
   */
  s?: {
    usage?: LicenseMonitoringMode;
    performance?: LicenseMonitoringMode;
    errors?: LicenseMonitoringMode;
    safeErrors?: LicenseMonitoringMode;
    errorTraces?: LicenseMonitoringMode;
  };
}

/** Fixed first segment of a well-formed license token. */
const LICENSE_TOKEN_PREFIX = "I";
/** Fixed watermark segment of a well-formed license token. */
const LICENSE_TOKEN_WATERMARK = "CPECUVF";

/**
 * Runtime guard: asserts that a value parsed from a license token carries every
 * required field with the expected type. Throws a descriptive error otherwise.
 *
 * Only the always-present fields (`v`, `e`, `u`, `m`) are validated — everything
 * else in {@link LicensePayload} is optional and issuer-dependent. Internal:
 * callers get validation for free via {@link decodeLicenseToken}.
 */
function assertLicensePayload(value: unknown): asserts value is LicensePayload {
  if (typeof value !== "object" || value === null) {
    throw new Error(`invalid license payload: expected an object, got ${typeof value}`);
  }
  const p = value as Record<string, unknown>;
  const requireType = (field: string, type: "number" | "string") => {
    if (typeof p[field] !== type) {
      throw new Error(
        `invalid license payload: field "${field}" must be a ${type}, got ${typeof p[field]}`,
      );
    }
  };
  requireType("v", "number");
  requireType("e", "number");
  requireType("u", "string");
  requireType("m", "string");
}

/**
 * Decode a raw license token into a validated {@link LicensePayload}.
 *
 * Mirrors the desktop app's token parser and the backend's `NewLicenseFromPayload`:
 * it splits the `I.<base64Payload>.<watermark>.<signature>` envelope, checks the
 * fixed prefix/watermark, base64-decodes the payload segment and validates that
 * all required fields are present. This does NOT verify the cryptographic
 * signature — as token is used by MiLM manager to access its API, this signature
 * is for MiLM itself, who issued the token.
 */
export function decodeLicenseToken(token: string): LicensePayload {
  const segments = token.split(".");
  const [prefix, base64Payload, watermark, signature] = segments;
  if (
    segments.length !== 4 ||
    prefix !== LICENSE_TOKEN_PREFIX ||
    watermark !== LICENSE_TOKEN_WATERMARK ||
    typeof base64Payload !== "string" ||
    base64Payload.length === 0 ||
    typeof signature !== "string" ||
    signature.length === 0
  ) {
    throw new Error("invalid license token: unexpected envelope format");
  }

  const payloadStr = Buffer.from(base64Payload, "base64").toString("utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadStr);
  } catch (cause) {
    throw new Error("invalid license token: payload is not valid JSON", { cause });
  }

  assertLicensePayload(parsed);
  return parsed;
}
