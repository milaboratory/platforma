import type { ResourceType } from '@milaboratories/pl-client';
import { z } from 'zod';

export type DumpedNode = {
  type: ResourceType;
  data?: unknown;
  inputs?: Record<string, DumpedNode>;
  outputs?: Record<string, DumpedNode>;
  dynamics?: Record<string, DumpedNode>;
  error?: string;
};

/** Zod schema for ResourceType */
const ResourceTypeSchema = z.object({
  name: z.string(),
  version: z.string(),
});

/** Zod schema for DumpedNode (recursive) */
const DumpedNodeSchema: z.ZodType<DumpedNode> = z.lazy(() =>
  z.object({
    type: ResourceTypeSchema,
    data: z.unknown().optional(),
    inputs: z.record(z.string(), DumpedNodeSchema).optional(),
    outputs: z.record(z.string(), DumpedNodeSchema).optional(),
    dynamics: z.record(z.string(), DumpedNodeSchema).optional(),
    error: z.string().optional(),
  }),
);

/**
 * Zod schema for BlockDump (schema v2)
 *
 * Schema v2 uses separate fields for args and UI state:
 * - currentArgs: Current arguments edited by user
 * - uiState: UI-specific state (not used in workflow)
 * - prodArgs: Arguments snapshot when production was started
 *
 * Production fields are optional as they're not present in early states.
 * See: stage1.md for schema evolution details.
 */
export const BlockDumpSchemaV2 = z.object({
  blockId: z.string(),
  currentArgs: DumpedNodeSchema,
  blockSettings: DumpedNodeSchema,
  uiState: DumpedNodeSchema,
  prodArgs: DumpedNodeSchema.optional(),
  prodUiCtx: DumpedNodeSchema.optional(),
  prodOutput: DumpedNodeSchema.optional(),
  prodCtx: DumpedNodeSchema.optional(),
  prodCtxPrevious: DumpedNodeSchema.optional(),
});

/** Zod schema for array of BlockDump (schema v2) */
export const BlockDumpArraySchemaV2 = z.array(BlockDumpSchemaV2);

/**
 * Zod schema for BlockDump (schema v3 - future)
 *
 * Schema v3 introduces unified state management:
 * - state: Single unified field containing all persistent state
 * - prodArgs: Derived args for production (from args(state))
 * - stagingArgs: Derived args for staging/pre-run (from preRunArgs(state))
 * - currentArgs: Snapshot at production run time
 *
 * For Model API v1/v2 blocks, state = { args, uiState } with compatibility layer.
 * For Model API v3 blocks, state is user-defined with args derivation.
 *
 * See: stage1.md and stage1-implementation-plan.md for full specification.
 */
export const BlockDumpSchemaUnified = z.object({
  blockId: z.string(),
  // Core v3 fields
  state: DumpedNodeSchema.optional(), // Unified state (v3)
  blockSettings: DumpedNodeSchema,
  // Args fields
  currentArgs: DumpedNodeSchema, // Snapshot at production run time
  prodArgs: DumpedNodeSchema.optional(), // Derived args for production
  stagingArgs: DumpedNodeSchema.optional(), // Derived args for staging (v3)
  // Production context and output
  prodUiCtx: DumpedNodeSchema.optional(),
  prodOutput: DumpedNodeSchema.optional(),
  prodCtx: DumpedNodeSchema.optional(),
  prodCtxPrevious: DumpedNodeSchema.optional(),
});

/** Zod schema for array of BlockDump (schema v3 - future) */
export const BlockDumpArraySchemaUnified = z.array(BlockDumpSchemaUnified);

export type BlockDumpUnified = {
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
} | undefined;

export type ProjectDump = {
  project: { field: string; value: string | undefined }[];
  blocks: BlockDumpUnified[] | undefined;
} | undefined;

export type BlockDumpValidatorUnified = z.ZodType<BlockDumpUnified[]>;
