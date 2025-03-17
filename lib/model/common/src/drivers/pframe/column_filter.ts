import { ValueType } from './spec/spec';

/** Allows to search multiple columns in different contexts. */
export interface ColumnFilter {
  /** Match any of the types listed here. If undefined, will be ignored during
   * matching. */
  readonly type?: ValueType[];

  /** Match any of the names listed here. If undefined, will be ignored during
   * matching. */
  readonly name?: string[];

    /** Match requires all the domains listed here to have corresponding values. */
  readonly domainValue?: Record<string, string>;

  /** Match requires all the annotations listed here to have corresponding values. */
  readonly annotationValue?: Record<string, string>;

  /** Match requires all the annotations listed here to match corresponding regex
   * pattern. */
  readonly annotationPattern?: Record<string, string>;
}
