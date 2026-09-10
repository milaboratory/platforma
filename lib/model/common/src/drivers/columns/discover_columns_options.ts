import type { ColumnSelector, RelaxedColumnSelector } from "../../columns/column_selector";
import type { PlRef } from "../../ref";
import type { PObjectId } from "../../pool";
import type { PColumnSpec, AxisQualification } from "../pframe/spec";
import type { DiscoverColumnsConstraints } from "../pframe/spec_driver";
import { throwError } from "@milaboratories/helpers";

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
  /**
   * Anchors enable axis-aware discovery + linker traversal. The anchors are the
   * coarse end of the hierarchy, so discovery walks down to what they contain
   * (anchored on `sample`, reaching `cell`).
   *
   * Mutually exclusive with {@link DiscoverColumnsOptions.leaves}.
   */
  // @todo: migrate to array<AnchorEntry>
  anchors?: Record<string, AnchorEntry>;
  /**
   * Same as {@link DiscoverColumnsOptions.anchors}, but the given columns are
   * the fine end of the hierarchy, so discovery walks up to what contains them
   * (given `cell`, reaching `sample`).
   *
   * Mutually exclusive with {@link DiscoverColumnsOptions.anchors}.
   */
  leaves?: Record<string, AnchorEntry>;
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
 * scope is fixed by the source collection, so `mode` / `maxHops` / `leaves` are
 * not part of the filter surface — only `include` / `exclude` / `anchors`.
 */
export type ColumnsFilterOptions = Omit<DiscoverColumnsOptions, "mode" | "maxHops" | "leaves">;

/**
 * Resolve the two mutually exclusive anchor keys into the single anchor record
 * the request carries, plus the `anchorsAre` discriminator the engine needs.
 *
 * Which key the caller used *is* the statement about where the given columns
 * sit in the hierarchy, so there is no separate direction option to pass.
 *
 * @throws if both `anchors` and `leaves` are given.
 */
export function resolveAnchorSide(options: Pick<DiscoverColumnsOptions, "anchors" | "leaves">): {
  anchors: Record<string, AnchorEntry> | undefined;
  anchorsAre: NonNullable<DiscoverColumnsConstraints["anchorsAre"]>;
} {
  if (options.anchors !== undefined && options.leaves !== undefined) {
    throwError(
      `"anchors" and "leaves" are mutually exclusive — pass "anchors" to discover ` +
        `what they contain, or "leaves" to discover what contains them`,
    );
  }
  return options.leaves !== undefined
    ? { anchors: options.leaves, anchorsAre: "leaves" }
    : { anchors: options.anchors, anchorsAre: "roots" };
}

/**
 * Translate a {@link MatchingMode} into the boolean-flag form the spec driver
 * consumes. `anchorsAre` is orthogonal to the mode — it says where the anchors
 * sit, not how axes are matched — so it is threaded through unchanged and
 * omitted for the default (`"roots"`).
 */
export function matchingModeToConstraints(
  mode: MatchingMode,
  anchorsAre?: DiscoverColumnsConstraints["anchorsAre"],
): DiscoverColumnsConstraints {
  const direction = anchorsAre !== undefined && anchorsAre !== "roots" ? { anchorsAre } : {};
  switch (mode) {
    case "enrichment":
      return {
        allowFloatingSourceAxes: true,
        allowFloatingHitAxes: false,
        allowSourceQualifications: true,
        allowHitQualifications: true,
        ...direction,
      };
    case "related":
      return {
        allowFloatingSourceAxes: true,
        allowFloatingHitAxes: true,
        allowSourceQualifications: true,
        allowHitQualifications: true,
        ...direction,
      };
    case "exact":
      return {
        allowFloatingSourceAxes: false,
        allowFloatingHitAxes: false,
        allowSourceQualifications: false,
        allowHitQualifications: false,
        ...direction,
      };
  }
}
