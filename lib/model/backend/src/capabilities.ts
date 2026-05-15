/**
 * Backend capability tokens advertised by pl in
 * `MaintenanceAPI.Ping.Response.capabilities` and required by compiled
 * templates via `TemplateDataV3.requiredCapabilities`.
 *
 * Single TypeScript source of truth shared across:
 *   - `@platforma-sdk/tengo-builder` — populates the field at compile time
 *   - `@platforma-sdk/block-tools` — copies it onto the published manifest
 *   - `@milaboratories/pl-middle-layer` — checks it at install time
 *
 * Mirror of `pl/platform/api/plapiserver/server_capabilities.go` — keep
 * tokens in sync with the backend's advertised list. Format is
 * `<feature>:<version>`; bump the version when wire semantics change.
 */

/**
 * Backend bundles a wasmtime-based WASI 0.2 / Component Model runtime.
 * Templates that reference wasm components via `assets.importWasm(...)`
 * require this capability.
 */
export const CapabilityWasm = "wasm:v1";
