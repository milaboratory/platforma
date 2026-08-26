import type { PTableColumnSpec } from "@milaboratories/pl-middle-layer";
import { errorResult } from "./types";

export type ToolError = ReturnType<typeof errorResult>;

export interface ToolFailure {
  message: string;
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

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function blockStateNotAvailable(): ToolError {
  return toolError({
    message: "Block state is not available yet.",
    hint: "The project may still be loading. Use get_project_overview to check the block's calculationStatus, then read the state again.",
  });
}

export function emptyColumnList(): ToolError {
  return toolError({
    message: "The columns list is empty, so no column was read.",
    hint: "Omit columns to read every column, or pass the indices you want. Use get_block_outputs to see the column indices.",
  });
}

export function unreadableColumnsError(columns: UnreadableColumn[]): ToolError {
  const named = columns.map((c) => `${c.name} (index ${c.index}, type ${c.valueType})`).join(", ");
  return toolError({
    message: `These columns hold a value type this server cannot return: ${named}.`,
    hint: "Pass columns without those indices to read the rest of the table.",
  });
}

export function tableReadFailed(stage: "spec" | "data", cause: unknown): ToolError {
  if (stage === "spec") {
    return toolError({
      message: `Reading the table spec failed: ${messageOf(cause)}`,
      hint: "The handle may be stale, or may not belong to a table. Use get_block_outputs to re-read the handles for this block.",
    });
  }
  return toolError({
    message: `Reading the table data failed: ${messageOf(cause)}`,
    hint: "Check the column indices and the row range against the table spec. Use get_block_outputs to re-read the handle and its column count.",
  });
}

export function transformFailed(cause: unknown, variables: string): ToolFailure {
  return {
    message: `Transform failed: ${messageOf(cause)}`,
    hint: `Check your JS expression syntax. Available variables: ${variables}.`,
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
