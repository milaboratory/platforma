// Capability strings advertised by the backend in MaintenanceAPI.Ping.Response.capabilities.
// Single source of truth on the client side; backend mirror is server_capabilities.go.

export const CapabilityAuthV2 = "auth:v2";
export const CapabilityTreeFilter = "treeFilter:v1";

export type PlCapability = typeof CapabilityAuthV2 | typeof CapabilityTreeFilter;
