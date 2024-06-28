import { PColumnIdAndSpec, SingleColumnSelector } from '@milaboratory/sdk-model';

export interface GetColumnSpecRequest {
  columnSelector: SingleColumnSelector;
}

export interface GetColumnSpecResponse {
  hit: PColumnIdAndSpec | null;
}
