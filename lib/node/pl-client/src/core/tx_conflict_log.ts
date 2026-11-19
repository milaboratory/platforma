import type { MiLogger } from "@milaboratories/ts-helpers";
import { LRUCache } from "lru-cache";
import type { TxStat } from "./stat";

/** A write transaction attempt whose commit lost to a concurrent write. */
export type TxConflict = {
  /** Transaction name given by the caller. */
  name: string;
  /** Advisory lock the attempt ran under, undefined when it ran without one. */
  lockId: string | undefined;
  /** 1-based number of the attempt that conflicted. */
  attempt: number;
  /** Attempt budget of the transaction. */
  maxAttempts: number;
  /** Delay before the next attempt, in ms. */
  nextDelay: number;
  /** Work done by the conflicted attempt. */
  stat: TxStat;
};

export type TxConflictLogOps = {
  /** A transaction name gets at most one warning per window, in ms. */
  windowMs: number;
  /** Number of transaction names whose windows are tracked at once. */
  maxNames: number;
  now: () => number;
};

export const DefaultTxConflictLogOps: TxConflictLogOps = {
  windowMs: 10_000,
  maxNames: 256,
  now: () => Date.now(),
};

/**
 * Reports commit conflicts as warnings, at most one per transaction name per window.
 * Conflicts of that name inside the window are counted, and the next warning for the name
 * carries the count.
 */
export class TxConflictLog {
  private readonly windows: LRUCache<string, NameWindow>;

  constructor(
    private readonly logger: MiLogger,
    private readonly ops: TxConflictLogOps = DefaultTxConflictLogOps,
  ) {
    this.windows = new LRUCache({ max: ops.maxNames });
  }

  public record(conflict: TxConflict): void {
    const now = this.ops.now();
    const window = this.windows.get(conflict.name);
    if (window !== undefined && now - window.openedAt < this.ops.windowMs) {
      window.suppressed++;
      return;
    }
    this.windows.set(conflict.name, { openedAt: now, suppressed: 0 });
    this.logger.warn(formatTxConflict(conflict, window?.suppressed ?? 0));
  }
}

/** One-line warning text; `suppressed` is the number of same-name conflicts not reported since the previous warning. */
export function formatTxConflict(conflict: TxConflict, suppressed: number): string {
  const parts = [
    `tx commit conflict: name=${JSON.stringify(conflict.name)}`,
    `lockId=${conflict.lockId ?? "none"}`,
    `attempt=${conflict.attempt}/${conflict.maxAttempts}`,
    `nextDelay=${Math.round(conflict.nextDelay)}ms`,
  ];
  if (suppressed > 0) parts.push(`suppressed=${suppressed}`);
  parts.push(`stat=${JSON.stringify(nonZeroStat(conflict.stat))}`);
  return parts.join(" ");
}

// Internals

type NameWindow = {
  openedAt: number;
  suppressed: number;
};

function nonZeroStat(stat: TxStat): Record<string, number> {
  return Object.fromEntries(Object.entries(stat).filter(([, value]) => value !== 0));
}
