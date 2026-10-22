import type { LinkIssue } from "@platforma-sdk/model";
import { isPlainObject } from "es-toolkit";
import type { ComputedRef, MaybeRefOrGetter } from "vue";
import { computed, shallowRef, toValue, watch } from "vue";

/**
 * Whether the alert is shown in full, or folded to one line. A folded alert tells whether it
 * says something else now than when it was folded.
 */
export type AlertFoldState = { type: "open" } | { type: "folded"; updated: boolean };

/**
 * The fold of the alert of block `blockId`, which says `issues`. The fold is the reader's own:
 * it is kept in the browser storage, not with the block, so it does not change the block. An
 * alert is open until the reader folds it.
 */
export function useAlertFold(options: {
  blockId: MaybeRefOrGetter<string | undefined>;
  issues: MaybeRefOrGetter<readonly LinkIssue[]>;
}): { state: ComputedRef<AlertFoldState>; fold: () => void; open: () => void } {
  const stored = shallowRef<StoredFold>(OPEN);
  watch(
    () => toValue(options.blockId),
    (blockId) => {
      stored.value = blockId === undefined ? OPEN : readFold(blockId);
    },
    { immediate: true },
  );
  const saying = computed(() => sayingOf(toValue(options.issues)));

  const state = computed((): AlertFoldState => {
    const fold = stored.value;
    return fold.type === "open" ? fold : { type: "folded", updated: fold.seen !== saying.value };
  });

  const store = (fold: StoredFold) => {
    stored.value = fold;
    const blockId = toValue(options.blockId);
    if (blockId !== undefined) writeFold(blockId, fold);
  };

  return {
    state,
    fold: () => store({ type: "folded", seen: saying.value }),
    open: () => store(OPEN),
  };
}

// Internals

/** `seen`: what the alert said when it was folded. */
type StoredFold = { type: "open" } | { type: "folded"; seen: string };

const OPEN: StoredFold = { type: "open" };

function sayingOf(issues: readonly LinkIssue[]): string {
  return JSON.stringify(issues.map((issue) => [issue.key, issue.text]));
}

function storageKey(blockId: string): string {
  return `pl-block-dependencies/${blockId}`;
}

/** Storage may be unavailable, or hold anything: the alert is open then. */
function readFold(blockId: string): StoredFold {
  try {
    return parseFold(localStorage.getItem(storageKey(blockId)));
  } catch {
    return OPEN;
  }
}

function parseFold(raw: string | null): StoredFold {
  if (raw === null) return OPEN;
  const value: unknown = JSON.parse(raw);
  if (isPlainObject(value) && value.type === "folded" && typeof value.seen === "string") {
    return { type: "folded", seen: value.seen };
  }
  return OPEN;
}

/** A fold that cannot be stored lasts while the block is open. */
function writeFold(blockId: string, fold: StoredFold): void {
  try {
    if (fold.type === "open") localStorage.removeItem(storageKey(blockId));
    else localStorage.setItem(storageKey(blockId), JSON.stringify(fold));
  } catch {
    // The fold stays in memory.
  }
}
