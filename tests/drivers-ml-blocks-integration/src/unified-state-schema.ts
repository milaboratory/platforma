import type { ResourceType } from "@milaboratories/pl-client";
import * as v from "valibot";

export type DumpedNode = {
  type: ResourceType;
  data?: unknown;
  inputs?: Record<string, DumpedNode>;
  outputs?: Record<string, DumpedNode>;
  dynamics?: Record<string, DumpedNode>;
  error?: string;
};

/** Valibot schema for ResourceType */
const ResourceTypeSchema = v.object({
  name: v.string(),
  version: v.string(),
});

/** Valibot schema for DumpedNode (recursive) */
const DumpedNodeSchema: v.GenericSchema<DumpedNode> = v.lazy(() =>
  v.object({
    type: ResourceTypeSchema,
    data: v.optional(v.unknown()),
    inputs: v.optional(v.record(v.string(), DumpedNodeSchema)),
    outputs: v.optional(v.record(v.string(), DumpedNodeSchema)),
    dynamics: v.optional(v.record(v.string(), DumpedNodeSchema)),
    error: v.optional(v.string()),
  }),
);

/**
 * Valibot schema for BlockDump (schema v2)
 *
 * Schema v2 uses separate fields for args and UI state:
 * - currentArgs: Current arguments edited by user
 * - uiState: UI-specific state (not used in workflow)
 * - prodArgs: Arguments snapshot when production was started
 *
 * Production fields are optional as they're not present in early states.
 * See: stage1.md for schema evolution details.
 */
export const BlockDumpSchemaV2 = v.object({
  blockId: v.string(),
  currentArgs: DumpedNodeSchema,
  blockSettings: DumpedNodeSchema,
  uiState: DumpedNodeSchema,
  prodArgs: v.optional(DumpedNodeSchema),
  prodUiCtx: v.optional(DumpedNodeSchema),
  prodOutput: v.optional(DumpedNodeSchema),
  prodCtx: v.optional(DumpedNodeSchema),
  prodCtxPrevious: v.optional(DumpedNodeSchema),
});

/** Valibot schema for array of BlockDump (schema v2) */
export const BlockDumpArraySchemaV2 = v.array(BlockDumpSchemaV2);

/**
 * Valibot schema for BlockDump (schema v3 - future)
 *
 * Schema v3 introduces unified state management:
 * - state: Single unified field containing all persistent state
 * - prodArgs: Derived args for production (from args(state))
 * - stagingArgs: Derived args for staging/prerun (from prerunArgs(state))
 * - currentArgs: Snapshot at production run time
 *
 * For Model API v1/v2 blocks, state = { args, uiState } with compatibility layer.
 * For Model API v3 blocks, state is user-defined with args derivation.
 *
 * See: stage1.md and stage1-implementation-plan.md for full specification.
 */
export const BlockDumpSchemaUnified = v.object({
  blockId: v.string(),
  // Core v3 fields
  state: v.optional(DumpedNodeSchema), // Unified state (v3)
  blockSettings: DumpedNodeSchema,
  // Args fields
  currentArgs: DumpedNodeSchema, // Snapshot at production run time
  prodArgs: v.optional(DumpedNodeSchema), // Derived args for production
  stagingArgs: v.optional(DumpedNodeSchema), // Derived args for staging (v3)
  // Production context and output
  prodUiCtx: v.optional(DumpedNodeSchema),
  prodOutput: v.optional(DumpedNodeSchema),
  prodCtx: v.optional(DumpedNodeSchema),
  prodCtxPrevious: v.optional(DumpedNodeSchema),
});

/** Valibot schema for array of BlockDump (schema v3 - future) */
export const BlockDumpArraySchemaUnified = v.array(BlockDumpSchemaUnified);

export type BlockDumpUnified =
  | {
      blockId: string;
      currentArgs: DumpedNode;
      blockSettings: DumpedNode;
      blockStorage?: DumpedNode;
      state?: DumpedNode;
      prodArgs?: DumpedNode;
      prodUiCtx?: DumpedNode;
      prodOutput?: DumpedNode;
      prodCtx?: DumpedNode;
      prodCtxPrevious?: DumpedNode;
      prodUiCtxPrevious?: DumpedNode;
      prodOutputPrevious?: DumpedNode;
      // Staging fields
      stagingCtx?: DumpedNode;
      stagingUiCtx?: DumpedNode;
      stagingOutput?: DumpedNode;
      stagingCtxPrevious?: DumpedNode;
      stagingUiCtxPrevious?: DumpedNode;
      stagingOutputPrevious?: DumpedNode;
    }
  | undefined;

export type ProjectDump =
  | {
      project: { field: string; value: string | undefined }[];
      blocks: BlockDumpUnified[] | undefined;
    }
  | undefined;

export type BlockDumpValidatorUnified = v.GenericSchema<BlockDumpUnified[]>;
