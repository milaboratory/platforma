import { textResult } from "./types";
import type { FailedEntry, ToolError } from "./unreadable";
import {
  batchTooLarge,
  blockReadFailed,
  duplicateBlockId,
  emptyBlockList,
  failedEntry,
  toolError,
} from "./unreadable";

export const MAX_BATCH_ENTRIES = 10;

export interface SucceededEntry {
  ok: true;
  value: unknown;
}

export type BatchEntry = SucceededEntry | FailedEntry;

export type BatchResult = ToolError | ReturnType<typeof textResult>;

export function succeededEntry(value: unknown): SucceededEntry {
  return { ok: true, value };
}

export async function readBatch(
  blockIds: string[],
  read: (blockId: string) => Promise<BatchEntry>,
): Promise<BatchResult> {
  if (blockIds.length === 0) return toolError(emptyBlockList());
  if (blockIds.length > MAX_BATCH_ENTRIES) {
    return toolError(batchTooLarge(blockIds.length, MAX_BATCH_ENTRIES));
  }

  const seen = new Set<string>();
  for (const blockId of blockIds) {
    if (seen.has(blockId)) return toolError(duplicateBlockId(blockId));
    seen.add(blockId);
  }

  const entries: Record<string, BatchEntry> = {};
  for (const blockId of blockIds) {
    try {
      entries[blockId] = await read(blockId);
    } catch (cause) {
      entries[blockId] = failedEntry(blockReadFailed(cause));
    }
  }
  return textResult(entries);
}
