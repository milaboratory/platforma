/**
 * Backend capability tokens advertised by pl in
 * `MaintenanceAPI.Ping.Response.capabilities`.
 * Capabilities affect behaviour of inner ML mechanisms and allow
 * to detect incompatibilities between blocks and backend via
 * via `TemplateDataV3.requiredCapabilities`.
 *
 * Keep tokens in sync with the backend's advertised list. Format is
 * `<feature>:<version>`; bump the version when wire semantics change.
 *
 * Shared across:
 *   - `@milaboratories/pl-client`        — client-side capability checks
 *   - `@platforma-sdk/tengo-builder`     — populates `requiredCapabilities` at compile time
 *   - `@platforma-sdk/block-tools`       — copies it onto the published manifest
 *   - `@milaboratories/pl-middle-layer`  — checks it at install time
 */
export type BackendCapability =
  | "auth:v2"
  | "treeFilter:v2"
  | "wasm:v1"
  // Project-sharing capability tokens.
  | "crossTreeRefs:v1" // cross-color field attach (accept a foreign-colored shared envelope)
  | "userListing:v1" // list users for the recipient picker
  | "publicGrants:v1" // public (everyone) grants allowed for any role
  | "txListGrants:v1"; // list grants inside a transaction (batched recipient reads)

/** True iff `capabilities` advertises the requested token. */
export function hasCapability(
  capabilities: readonly string[] | undefined,
  capability: BackendCapability,
): boolean {
  return capabilities?.includes(capability) ?? false;
}
