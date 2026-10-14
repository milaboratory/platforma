import type { Project } from "@milaboratories/pl-middle-layer";
import { getStorageData, normalizeBlockStorage } from "@platforma-sdk/model";
import { sleep } from "./util";

/** The pool ref of a column another block exported under `<output>.<column>`. */
export function exportedRef(blockId: string, output: string, column: string) {
  return { __isRef: true as const, blockId, name: `${output}.${column}` };
}

/** Merge `patch` into a V3 block's persisted data, keeping every other field. */
export async function patchBlockData(
  rawPrj: Project,
  blockId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const state = (await rawPrj.getBlockState(blockId).getValue()) as { blockStorage: unknown };
  const raw =
    typeof state.blockStorage === "string" ? JSON.parse(state.blockStorage) : state.blockStorage;
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
 * which a busy backend exceeds long before anything is wrong.
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
    const s = await state.getValue();
    last = (s.outputs as Record<string, OutputSnapshot | undefined>)[name];
    if (last?.ok && last.value !== undefined && last.stable !== false) return last.value as T;
    if (last !== undefined && !last.ok)
      throw new Error(`Output ${name} is not ok: ${JSON.stringify(last.errors)}`);
    await sleep(pollInterval);
  }
  throw new Error(
    `Output ${name} of ${blockId} did not settle within ${timeoutMs} ms: ${JSON.stringify(last)}`,
  );
}
