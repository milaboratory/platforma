import type { BlockPackSpecAny, Project } from "@milaboratories/pl-middle-layer";
import type { PlRef } from "@platforma-sdk/model";
import { createPlRef, getStorageData, normalizeBlockStorage } from "@platforma-sdk/model";
import { sleep } from "./util";

/** The pool ref of a column another block exported under `<output>.<column>`. */
export function exportedRef(blockId: string, output: string, column: string): PlRef {
  return createPlRef(blockId, `${output}.${column}`);
}

/** Merge `patch` into a V3 block's persisted data, keeping every other field. */
export async function patchBlockData(
  rawPrj: Project,
  blockId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { blockStorage } = await rawPrj.getBlockState(blockId).getValue();
  const raw = typeof blockStorage === "string" ? JSON.parse(blockStorage) : blockStorage;
  const current = getStorageData<Record<string, unknown>>(normalizeBlockStorage(raw));
  await rawPrj.mutateBlockStorage(blockId, {
    operation: "update-block-data",
    value: { ...current, ...patch },
  });
}

type OutputSnapshot = { ok: boolean; value?: unknown; errors?: unknown; stable?: boolean };

/**
 * Read one block output once it is ok, defined and stable. Polls on a deadline rather than
 * awaiting stability: the stability wait gives up after a fixed number of tree changes,
 * which a busy backend exceeds long before anything is wrong. An error throws only once the
 * whole block state is stable; an upstream that is still recalculating can fail an output
 * in passing, and an error snapshot carries no stability flag of its own.
 */
export async function stableOutput<T>(
  rawPrj: Project,
  blockId: string,
  name: string,
  timeoutMs: number,
  pollInterval = 1000,
): Promise<T> {
  const state = rawPrj.getBlockState(blockId);
  const deadline = Date.now() + timeoutMs;
  let last: OutputSnapshot | undefined;
  while (Date.now() < deadline) {
    const { value: s, stable } = await state.getFullValue();
    last = (s.outputs as Record<string, OutputSnapshot | undefined> | undefined)?.[name];
    if (last?.ok && last.value !== undefined && last.stable !== false) return last.value as T;
    if (last !== undefined && !last.ok && stable)
      throw new Error(`Output ${name} is not ok: ${JSON.stringify(last.errors)}`);
    await sleep(Math.min(pollInterval, Math.max(0, deadline - Date.now())));
  }
  throw new Error(
    `Output ${name} of ${blockId} did not settle within ${timeoutMs} ms: ${JSON.stringify(last)}`,
  );
}

const ADD_BLOCK_ATTEMPTS = 3;
const STALE_TEMPLATE_ERROR = /target resource .* does not exist/;

/**
 * `rawPrj.addBlock` with a bounded retry on a stale template reference. Under concurrent
 * block additions the middle layer's template cache can hand out a template resource the
 * backend has since dropped, and the add fails assigning the block pack's `template` field
 * ("wrong resource reference: target resource ... does not exist"). The next attempt loads
 * the template afresh. Any other error propagates at once.
 */
export async function addBlock(
  rawPrj: Project,
  label: string,
  spec: BlockPackSpecAny,
): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await rawPrj.addBlock(label, spec);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (attempt >= ADD_BLOCK_ATTEMPTS || !STALE_TEMPLATE_ERROR.test(message)) throw e;
      console.warn(
        `addBlock(${label}) hit a stale template reference (attempt ${attempt}); retrying`,
      );
      await sleep(500 + Math.random() * 1000);
    }
  }
}
