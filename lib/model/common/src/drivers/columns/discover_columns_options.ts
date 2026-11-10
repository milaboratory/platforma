import type { ColumnSelector, RelaxedColumnSelector } from "../../columns/column_selector";
import type { PlRef } from "../../ref";
import type { PObjectId } from "../../pool";
import type { PColumnSpec, AxisQualification } from "../pframe/spec";
import type { DiscoverColumnsConstraints } from "../pframe/spec_driver";

/**
 * Axis matching behaviour applied to `discover` requests.
 *
 * - `enrichment` (default) — anchor axes may float over un-mapped hit axes;
 *   used by tooling that "extends" a query.
 * - `related` — both source and hit axes may float; widest match.
 * - `exact` — no floating, no qualifications; strict equality.
 */
export type MatchingMode = "enrichment" | "related" | "exact";

/**
 * Single entry accepted by `DiscoverColumnsOptions.anchors`. All variants are
 * trivially JSON-serialisable so the option carrier crosses the
 * sandbox/host VM bridge unchanged.
 */
export type AnchorEntry = PlRef | PObjectId | PColumnSpec | RelaxedColumnSelector;

/** Qualifications needed for both already-integrated anchor columns and the hit column. */
export interface MatchQualifications {
  /** Qualifications for already-integrated anchor columns */
  readonly forQueries?: Record<PObjectId, AxisQualification[]>;
  /** Qualifications for the hit column. */
  readonly forHit?: AxisQualification[];
}

/**
 * Options object accepted by sandbox `discoverColumns()` and by the host
 * `ColumnsCollectionDriver.discover` / `.filter` methods. Pure JSON shape —
 * no class instances, no closures.
 */
export interface DiscoverColumnsOptions {
  /** Include columns matching these selectors. If omitted, includes all. */
  include?: ColumnSelector;
  /** Exclude columns matching these selectors. */
  exclude?: ColumnSelector;
  /** Axis matching behavior. Default: 'enrichment'. Ignored if no anchors. */
  mode?: MatchingMode;
  /** Anchors enable axis-aware discovery + linker traversal. */
  // @todo: migrate to array<AnchorEntry>
  anchors?: Record<string, AnchorEntry>;
  /** Maximum linker hops. Default: 4 when anchors present, 0 otherwise. */
  maxHops?: number;
}

/**
 * Options accepted by `ColumnsCollection.discover` / driver `.discover`.
 * Traversal scope (`mode`, `maxHops`) must be specified explicitly — the
 * defaults from {@link DiscoverColumnsOptions} are intentionally surfaced as
 * required choices at the discovery entrypoint.
 */
export type ColumnsDiscoverOptions = DiscoverColumnsOptions;

/**
 * Options accepted by `ColumnsCollection.filter` / driver `.filter`. Traversal
 * scope is fixed by the source collection, so `mode` / `maxHops` are not part
 * of the filter surface — only `include` / `exclude` / `anchors`.
 */
export type ColumnsFilterOptions = Omit<DiscoverColumnsOptions, "mode" | "maxHops">;

/**
 * Options accepted by `ColumnsCollection.discoverRoots` / driver
 * `.discoverRoots`: find the roots the given columns hang off — the columns
 * that, used as `anchors` of {@link DiscoverColumnsOptions}, would reach them.
 * Pure JSON shape — no class instances, no closures.
 */
export interface DiscoverRootsOptions {
  /** Columns to find roots for. */
  leaves: AnchorEntry[];
  /** Roots must match these selectors. If omitted, includes all. */
  include?: ColumnSelector;
  /** Roots matching these selectors are dropped. */
  exclude?: ColumnSelector;
  /** Axis matching behavior, read with the root as the anchor. Default: 'enrichment'. */
  mode?: MatchingMode;
  /** Maximum linker hops between a root and a leaf. Default: 4. */
  maxHops?: number;
}

/** Translate a {@link MatchingMode} into the boolean-flag form the spec driver consumes. */
export function matchingModeToConstraints(mode: MatchingMode): DiscoverColumnsConstraints {
  switch (mode) {
    case "enrichment":
      return {
        allowFloatingSourceAxes: true,
        allowFloatingHitAxes: false,
        allowSourceQualifications: true,
        allowHitQualifications: true,
      };
    case "related":
      return {
        allowFloatingSourceAxes: true,
        allowFloatingHitAxes: true,
        allowSourceQualifications: true,
        allowHitQualifications: true,
      };
    case "exact":
      return {
        allowFloatingSourceAxes: false,
        allowFloatingHitAxes: false,
        allowSourceQualifications: false,
        allowHitQualifications: false,
      };
  }
}
