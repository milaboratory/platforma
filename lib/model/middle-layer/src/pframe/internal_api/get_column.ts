import { SingleColumnSelector } from './selectors';
import { ColumnIdAndSpec } from '@milaboratory/sdk-model';

export interface GetColumnSpecRequest {
  columnSelector: SingleColumnSelector;
}

export interface GetColumnSpecResponse {
  hit: ColumnIdAndSpec | null;
}
