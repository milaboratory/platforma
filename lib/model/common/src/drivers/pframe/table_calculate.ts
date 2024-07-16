import { PTableColumnId, PTableColumnSpec } from './table_common';
import { PTableVector } from './data';
import { assertNever } from '../../util';

/** Defines a terminal column node in the join request tree */
export interface ColumnJoinEntry<Col> {
  /** Node type discriminator */
  readonly type: 'column';

  /** Local column */
  readonly column: Col;
}

/**
 * Defines a join request tree node that will output only records present in
 * all child nodes ({@link entries}).
 * */
export interface InnerJoin<Col> {
  /** Node type discriminator */
  readonly type: 'inner';

  /** Child nodes to be inner joined */
  readonly entries: JoinEntry<Col>[];
}

/**
 * Defines a join request tree node that will output all records present at
 * least in one of the child nodes ({@link entries}), values for those PColumns
 * that lacks corresponding combinations of axis values will be marked as absent,
 * see {@link PTableVector.absent}.
 * */
export interface FullJoin<Col> {
  /** Node type discriminator */
  readonly type: 'full';

  /** Child nodes to be fully outer joined */
  readonly entries: JoinEntry<Col>[];
}

/**
 * Defines a join request tree node that will output all records present in
 * {@link primary} child node, and records from the {@link secondary} nodes will
 * be added to the output only if present, values for those PColumns from the
 * {@link secondary} list, that lacks corresponding combinations of axis values
 * will be marked as absent, see {@link PTableVector.absent}.
 *
 * This node can be thought as a chain of SQL LEFT JOIN operations starting from
 * the {@link primary} node and adding {@link secondary} nodes one by one.
 * */
export interface OuterJoin<Col> {
  /** Node type discriminator */
  readonly type: 'outer';

  /** Primes the join operation. Left part of LEFT JOIN. */
  readonly primary: JoinEntry<Col>;

  /** Driven nodes, giving their values only if primary node have corresponding
   * nodes. Right parts of LEFT JOIN chain. */
  readonly secondary: JoinEntry<Col>[];
}

/**
 * Base type of all join request tree nodes. Join request tree allows to combine
 * information from multiple PColumns into a PTable. Correlation between records
 * is performed by looking for records with the same values in common axis between
 * the PColumns. Common axis are those axis which have equal {@link AxisId} derived
 * from the columns axes spec.
 * */
export type JoinEntry<Col> =
  | ColumnJoinEntry<Col>
  | InnerJoin<Col>
  | FullJoin<Col>
  | OuterJoin<Col>;

/** Container representing whole data stored in specific PTable column. */
export interface FullPTableColumnData {
  /** Unified spec */
  readonly spec: PTableColumnSpec;

  /** Data */
  readonly data: PTableVector;
}

/**
 * Defines how should comparison be made between column or axis value with the
 * reference value.
 * */
export type SingleValuePredicateOperatorType = 'Equal';

/** Filtering predicate for a single axis or column value */
export interface SingleValuePredicate {
  /** Comparison operator */
  readonly operator: SingleValuePredicateOperatorType;
  /** Reference value */
  readonly reference: string | number;
}

/**
 * Filter PTable records based on specific axis or column value. If this is an
 * axis value filter and the axis is part of a partitioning key in some of the
 * source PColumns, the filter will be pushed down to those columns, so only
 * specific partitions will be retrieved from the remote storage.
 * */
export interface PTableRecordSingleValueFilter {
  /** Filter type discriminator */
  readonly type: 'bySingleColumn';

  /** Target axis selector to examine values from */
  readonly column: PTableColumnId;

  /** Value predicate */
  readonly predicate: SingleValuePredicate;
}

/** Generic PTable records filter */
export type PTableRecordFilter = PTableRecordSingleValueFilter;

/** Sorting parameters for a PTable.  */
export type PTableSorting = {
  /** Unified column identifier */
  readonly column: PTableColumnId;

  /** Sorting order */
  readonly ascending: boolean;

  /** Sorting in respect to NA and absent values */
  readonly naAndAbsentAreLeastValues: boolean;
};

/** Information required to instantiate a PTable. */
export interface PTableDef<Col> {
  /** Join tree to populate the PTable */
  readonly src: JoinEntry<Col>;

  /** Record filters */
  readonly filters: PTableRecordFilter[];

  /** Table sorting */
  readonly sorting: PTableSorting[];
}

/** Request to create and retrieve entirety of data of PTable. */
export type CalculateTableDataRequest<Col> = PTableDef<Col>;

/** Response for {@link CalculateTableDataRequest} */
export type CalculateTableDataResponse = FullPTableColumnData[];

export function mapPTableDef<C1, C2>(
  def: PTableDef<C1>,
  cb: (c: C1) => C2
): PTableDef<C2> {
  return { ...def, src: mapJoinEntry(def.src, cb) };
}

export function mapJoinEntry<C1, C2>(
  entry: JoinEntry<C1>,
  cb: (c: C1) => C2
): JoinEntry<C2> {
  switch (entry.type) {
    case 'column':
      return {
        type: 'column',
        column: cb(entry.column)
      };
    case 'inner':
    case 'full':
      return {
        type: entry.type,
        entries: entry.entries.map((col) => mapJoinEntry(col, cb))
      };
    case 'outer':
      return {
        type: 'outer',
        primary: mapJoinEntry(entry.primary, cb),
        secondary: entry.secondary.map((col) => mapJoinEntry(col, cb))
      };
    default:
      assertNever(entry);
  }
}
