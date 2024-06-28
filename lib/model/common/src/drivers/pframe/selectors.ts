import { ValueType } from './spec';

/** Allows to match a single axis, by which i.e. filter should be applied.
 * Matching is done using axis integration rules, i.e. matching axis may have
 * additional domains relative to those listed in this object, however domains
 * listed here must match. */
export interface SingleAxisSelector {
  /** Axis name should perfectly match the target */
  readonly name: string;

  /** Axis value type, if undefined will be ignored during matching */
  readonly type?: ValueType;

  /** Domains to match in the target axis and their values */
  readonly domain?: Record<string, string>;
}

/** Allows to select a column from PFrame or inside a join request, by its id
 * or name. Multiple hits obtained given the criteria from this object
 * considered to be an error. */
export interface SingleColumnSelector {
  /** Column id, if undefined will be ignored */
  readonly id?: string;

  /** Column name, if undefined will be ignored */
  readonly name?: string;

  /** Column value type, if undefined will be ignored */
  readonly type?: ValueType;
}
