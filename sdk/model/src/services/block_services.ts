import type { ServiceRequireFlags } from "@milaboratories/pl-model-common";
import { resolveRequiredServices } from "@milaboratories/pl-model-common";

/**
 * Services required by all V3 blocks by default.
 * Edit this when a new service should be available to all blocks.
 *
 * Standalone module to avoid circular dependencies between block_model.ts
 * and service type resolution.
 */
export const BLOCK_SERVICE_FLAGS = {
  requiresPFrameSpec: true,
} as const satisfies Partial<ServiceRequireFlags>;

export type BlockServiceFlags = typeof BLOCK_SERVICE_FLAGS;

export const blockServiceNames = resolveRequiredServices(BLOCK_SERVICE_FLAGS);
