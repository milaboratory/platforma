import { ColumnAxesWithQualifications } from './common';

export interface DeleteColumnFromColumnsRequest {
  columns: ColumnAxesWithQualifications[];

  /** Zero based index of the column to delete */
  delete: number;
}

export interface DeleteColumnFromColumnsResponse {
  columns: ColumnAxesWithQualifications[];
}
