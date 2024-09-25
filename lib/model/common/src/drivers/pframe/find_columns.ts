import type { ColumnFilter } from './column_filter';
import type { AxisId, PColumnIdAndSpec } from './spec';

/**
 * Request to search among existing columns in the PFrame. Two filtering
 * criteria can be used: (1) column ашдеук, to search for columns with
 * specific properties like name, annotations and domains, and (2) being
 * compatible with the given list of axis ids.
 * */
export interface FindColumnsRequest {
  /** Basic column filter */
  readonly columnFilter: ColumnFilter;

  /** Will only search for columns compatible with these list of axis ids */
  readonly compatibleWith: AxisId[];

  /**
   * Defines what level of compatibility with provided list of axis ids is required.
   *
   * If true will search only for such columns which axes completely maps onto the
   * axes listed in the {@link compatibleWith} list.
   * */
  readonly strictlyCompatible: boolean;
}

/** Response for {@link FindColumnsRequest} */
export interface FindColumnsResponse {
  /** Array of column ids found using request criteria. */
  readonly hits: PColumnIdAndSpec[];
}
