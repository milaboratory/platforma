import type { PObjectId } from "../pool";
import type { AccessorLike, ColumnEntriesProvider, LeafEntry } from "./types";

/**
 * Id-index over a set of {@link ColumnEntriesProvider}s. Sole job:
 * {@link PObjectId} → {@link LeafEntry}. Generic over the accessor flavour, so
 * the same class backs both sandbox (`TreeNodeAccessor`) and host
 * (`PlTreeNodeAccessor`) usage.
 *
 * Stateless beyond the provider list — every lookup goes through each
 * provider's `getPObjectEntries()` (cached inside the provider). Instantiate
 * directly at the call site that has the providers; there is no ambient
 * singleton.
 */
export class ColumnRegistry<A extends AccessorLike<A>> {
  constructor(private readonly providers: ReadonlyArray<ColumnEntriesProvider<A>>) {}

  /**
   * Resolve a {@link PObjectId} to its backing {@link LeafEntry}. Returns
   * `undefined` if the column is not reachable from any provider — caller
   * decides whether that's `absent` or `resolving` via {@link isFinal}.
   */
  resolve(id: PObjectId): LeafEntry<A> | undefined {
    return this.lookupById(id);
  }

  /** Whether every indexed source has finished enumerating its columns. */
  isFinal(): boolean {
    return this.providers.every((p) => p.isFinal());
  }

  private lookupById(id: PObjectId): LeafEntry<A> | undefined {
    // First-wins across providers — caller controls precedence via the
    // construction order of `providers`.
    for (const p of this.providers) {
      const hit = p.getPObjectEntries().get(id);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }
}
