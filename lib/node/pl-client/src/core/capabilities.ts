/**
 * Backend capability tokens advertised by pl in
 * `MaintenanceAPI.Ping.Response.capabilities`.
 * Capabilities affect behaviour of inner ML mechanisms and allow
 * to detect incompatibilities between blocks and backend via
 * via `TemplateDataV3.requiredCapabilities`.
 *
 * Mirror of `pl/platform/api/plapiserver/server_capabilities.go` — keep
 * tokens in sync with the backend's advertised list. Format is
 * `<feature>:<version>`; bump the version when wire semantics change.
 *
 * Shared across:
 *   - `@milaboratories/pl-client`        — client-side capability checks
 *   - `@platforma-sdk/tengo-builder`     — populates `requiredCapabilities` at compile time
 *   - `@platforma-sdk/block-tools`       — copies it onto the published manifest
 *   - `@milaboratories/pl-middle-layer`  — checks it at install time
 */
export const BackendCapability = {
  AuthV2: "auth:v2",
  TreeFilterV2: "treeFilter:v2",
  WasmV1: "wasm:v1",
} as const;
export type BackendCapability = (typeof BackendCapability)[keyof typeof BackendCapability];

/** True iff `capabilities` advertises the requested token. */
export function hasCapability(
  capabilities: readonly string[] | undefined,
  capability: BackendCapability,
): boolean {
  return capabilities?.includes(capability) ?? false;
}
