import type { PColumnSpec } from "@milaboratories/pl-model-common";
import * as axes from "./axes.ts";
import * as buildQueryModule from "./build-query.ts";
import { PFrame } from "./p-frame.ts";
import * as rewriteFiltersModule from "./rewrite-filters.ts";
import * as table from "./table.ts";

export { PFrame, type LegacyQuery } from "./p-frame";

/** Creates a {@link PFrame} from a map of column ids to column specifications. */
export const createPFrame = (spec: Record<string, PColumnSpec>): PFrame => new PFrame(spec);

/** Expands an `AxesSpec` into `AxesId`s and resolves the parent information. */
export const expandAxes = axes.expand;

/** This operation is the inverse of {@link expandAxes}. */
export const collapseAxes = axes.collapse;

/** Returns the index of the axis that matches `selector`, or -1 if no axis matches. */
export const findAxis = axes.find;

/**
 * Returns the index of the table column that matches `selector`. It returns -1 if no
 * column matches. A table spec indexes the axes first and then the columns.
 */
export const findTableColumn = table.findColumn;

/**
 * Assembles a `SpecQueryJoinEntry` from a terminal column and an ordered path of
 * steps. The steps are linker hops and filter joins.
 *
 * The operation is a right fold over `path`, and it starts at the column. Each
 * `linker` step wraps the current subquery as a `linkerJoin`. Each `filter` step
 * wraps the current subquery as an `innerJoin` with the filter column.
 * `qualifications` annotate only the outermost entry.
 */
export const buildQuery = buildQueryModule.build;

/**
 * Upgrades the selector-based legacy record filters into index-based boolean
 * expressions for the data layer. It resolves them against the given unified table
 * spec.
 */
export const rewriteLegacyFilters = rewriteFiltersModule.rewriteLegacyFilters;
