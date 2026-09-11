import type { PTableColumnSpec } from "@milaboratories/pl-middle-layer";
import { errorResult } from "./types";

export type ToolError = ReturnType<typeof errorResult>;

export interface ToolFailure {
  message: string;
  hint: string;
}

export interface FailedEntry {
  ok: false;
  error: string;
  hint: string;
}

export interface UnreadableColumn {
  index: number;
  name: string;
  valueType: string;
}

export interface UnresolvedHandle {
  _type: "UnresolvedHandle";
  handle: string;
  pTableError: string;
  pFrameError: string;
  hint: string;
}

const UNREADABLE_VALUE_TYPES = new Set(["Bytes"]);

export function toolError(failure: ToolFailure): ToolError {
  return errorResult(failure.message, failure.hint);
}

export function failedEntry(failure: ToolFailure): FailedEntry {
  return { ok: false, error: failure.message, hint: failure.hint };
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function blockStateNotAvailable(): ToolFailure {
  return {
    message: "Block state is not available yet.",
    hint: "The project may still be loading. Use get_project_overview to check the block's calculationStatus, then read the state again.",
  };
}

export function emptyColumnList(): ToolFailure {
  return {
    message: "The columns list is empty, so no column was read.",
    hint: "Omit columns to read every column, or pass the indices you want. Use get_block_outputs to see the column indices.",
  };
}

export function unreadableColumnsError(columns: UnreadableColumn[]): ToolFailure {
  const named = columns.map((c) => `${c.name} (index ${c.index}, type ${c.valueType})`).join(", ");
  return {
    message: `These columns hold a value type this server cannot return: ${named}.`,
    hint: "Pass columns without those indices to read the rest of the table.",
  };
}

export function tableReadFailed(stage: "spec" | "data", cause: unknown): ToolFailure {
  if (stage === "spec") {
    return {
      message: `Reading the table spec failed: ${messageOf(cause)}`,
      hint: "The handle may be stale, or may not belong to a table. Use get_block_outputs to re-read the handles for this block.",
    };
  }
  return {
    message: `Reading the table data failed: ${messageOf(cause)}`,
    hint: "Check the column indices and the row range against the table spec. Use get_block_outputs to re-read the handle and its column count.",
  };
}

export function transformFailed(cause: unknown, variables: string): ToolFailure {
  return {
    message: `Transform failed: ${messageOf(cause)}`,
    hint: `Check your JS expression syntax. Available variables: ${variables}.`,
  };
}

export function batchTooLarge(count: number, maximum: number): ToolFailure {
  return {
    message: `This call asked for ${count} blocks, more than the maximum of ${maximum} per call.`,
    hint: `Split the block ids across several calls, each naming at most ${maximum} ids.`,
  };
}

export function emptyBlockList(): ToolFailure {
  return {
    message: "The list of block ids is empty, so no block was read.",
    hint: "Pass the ids of the blocks you want. Use get_project_overview to list the blocks in the project.",
  };
}

export function duplicateBlockId(blockId: string): ToolFailure {
  return {
    message: `The list of block ids names the same block more than once: ${blockId}.`,
    hint: "Pass each block id once — one entry answers for every mention of it.",
  };
}

export function blockHasNoOutputs(): ToolFailure {
  return {
    message: "Block has no outputs yet.",
    hint: "The block may not have been run. Use get_project_overview to check its calculationStatus, then run_block if needed.",
  };
}

export function noLogHandles(): ToolFailure {
  return {
    message: "No log handles found in block outputs.",
    hint: "This block may not produce logs, or it hasn't run yet. Use get_block_outputs to inspect available output types.",
  };
}

export function blockReadFailed(cause: unknown): ToolFailure {
  return {
    message: `Reading the block failed: ${messageOf(cause)}`,
    hint: "Use get_project_overview to check the block still exists and what its calculationStatus is, then read it again.",
  };
}

export function unresolvedHandle(
  handle: string,
  pTableError: string,
  pFrameError: string,
): UnresolvedHandle {
  return {
    _type: "UnresolvedHandle",
    handle,
    pTableError,
    pFrameError,
    hint: "This value may not be a table handle at all — if so, ignore this entry. Otherwise both reads failed for the reasons above; re-read the outputs with get_block_outputs and try again.",
  };
}

export function unreadableColumns(
  spec: PTableColumnSpec[],
  columnIndices: number[],
): UnreadableColumn[] {
  const found: UnreadableColumn[] = [];
  for (const index of columnIndices) {
    const entry = spec[index];
    if (!entry) continue;
    const valueType = entry.type === "column" ? entry.spec.valueType : entry.spec.type;
    if (!UNREADABLE_VALUE_TYPES.has(valueType)) continue;
    found.push({ index, name: entry.spec.name, valueType });
  }
  return found;
}
