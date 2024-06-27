import { ColumnFilter, ColumnIdAndSpec } from '@milaboratory/sdk-model';
import { AxisQualification, ColumnAxesWithQualifications } from './common';

export interface FilterColumnsRequest {
  columnSelector: ColumnFilter;
  compatibleWith: ColumnAxesWithQualifications[];
  strictlyCompatible: boolean;
}

export interface ColumnResponseQualifications {
  forQueries: AxisQualification[][];
  forHit: AxisQualification[];
}

export interface MappingVariant {
  qualifications: ColumnResponseQualifications;
  distinctiveQualifications: ColumnResponseQualifications;
}

export interface ColumnResponseHit {
  hit: ColumnIdAndSpec;
  mappingVariants: MappingVariant[];
}

export interface GetColumnsResponse {
  hits: ColumnResponseHit[];
}
