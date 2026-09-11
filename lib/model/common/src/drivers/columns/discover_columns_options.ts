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
 * Anchors at the coarse end of the hierarchy: discovery walks down to what
 * they contain (anchored on `sample`, reaching `cell`).
 */
export interface RootAnchoredOptions {
  // @todo: migrate to array<AnchorEntry>
  anchors?: Record<string, AnchorEntry>;
  leaves?: never;
}

/**
 * Anchors at the fine end of the hierarchy: discovery walks up to what
 * contains them (given `cell`, reaching `sample`).
 */
export interface LeafAnchoredOptions {
  leaves?: Record<string, AnchorEntry>;
  anchors?: never;
}

/** Everything about a discovery request except where the anchors sit. */
export interface DiscoverColumnsOptionsBase {
  /** Include columns matching these selectors. If omitted, includes all. */
  include?: ColumnSelector;
  /** Exclude columns matching these selectors. */
  exclude?: ColumnSelector;
  /** Axis matching behavior. Default: 'enrichment'. Ignored if no anchors. */
  mode?: MatchingMode;
  /** Maximum linker hops. Default: 4 when anchors present, 0 otherwise. */
  maxHops?: number;
}

/**
 * Options object accepted by sandbox `discoverColumns()` and by the host
 * `ColumnsCollectionDriver.discover` / `.filter` methods. Pure JSON shape —
 * no class instances, no closures.
 *
 * Anchors enable axis-aware discovery + linker traversal. Which key carries
 * them says where they sit, and therefore which way the traversal runs; the
 * two are mutually exclusive.
 */
export type DiscoverColumnsOptions = DiscoverColumnsOptionsBase &
  (RootAnchoredOptions | LeafAnchoredOptions);

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
 * of the filter surface, and neither is `leaves` — `.filter()` pins
 * `maxHops: 0`, leaving no traversal for it to describe.
 */
export type ColumnsFilterOptions = Omit<DiscoverColumnsOptionsBase, "mode" | "maxHops"> &
  RootAnchoredOptions;

/**
 * Resolve the two mutually exclusive anchor keys into the anchors themselves
 * plus the request arm they belong in.
 *
 * Which key the caller used *is* the statement about where the anchors sit, so
 * it is carried down as the shape of the request rather than flattened into a
 * direction flag beside it.
 *
 * @throws if both `anchors` and `leaves` are given.
 */
export function resolveAnchorSide(options: Pick<DiscoverColumnsOptions, "anchors" | "leaves">): {
  anchors: Record<string, AnchorEntry> | undefined;
  /** Which key of the request the anchors' axes go into. */
  axesKey: "axes" | "leafAxes";
} {
  if (options.anchors !== undefined && options.leaves !== undefined) {
    throwError(
      `"anchors" and "leaves" are mutually exclusive — pass "anchors" to discover ` +
        `what they contain, or "leaves" to discover what contains them`,
    );
  }
  return options.leaves !== undefined
    ? { anchors: options.leaves, axesKey: "leafAxes" }
    : { anchors: options.anchors, axesKey: "axes" };
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
