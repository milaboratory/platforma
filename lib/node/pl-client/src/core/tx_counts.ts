/**
 * How one transaction attempt ended:
 * - `committed`: the body returned and its write transaction committed;
 * - `closed`: the body returned without committing, as every read transaction does and a write
 *   transaction does when its body found nothing to write;
 * - `conflict`: the commit lost to a concurrent write, so the attempt is retried;
 * - `error`: the body or its commit failed in any other way.
 */
export type TxOutcome = "committed" | "closed" | "conflict" | "error";

/** Transaction attempts of one name, by how each ended. */
export type TxOutcomeCounts = Record<TxOutcome, number>;

/**
 * Counts transaction attempts by transaction name and outcome. A retried transaction counts once
 * per attempt. Names are fixed strings chosen by the callers, so the set of names stays small.
 */
export class TxCounter {
  private readonly byName = new Map<string, TxOutcomeCounts>();

  public record(name: string, outcome: TxOutcome): void {
    let counts = this.byName.get(name);
    if (counts === undefined) {
      counts = zeroCounts();
      this.byName.set(name, counts);
    }
    counts[outcome]++;
  }

  /** Counts so far; later attempts do not change the returned object. */
  public snapshot(): Record<string, TxOutcomeCounts> {
    return Object.fromEntries([...this.byName].map(([name, counts]) => [name, { ...counts }]));
  }
}

// Internals

function zeroCounts(): TxOutcomeCounts {
  return { committed: 0, closed: 0, conflict: 0, error: 0 };
}
