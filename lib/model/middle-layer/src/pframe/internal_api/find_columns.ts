import { ColumnFilter, PColumnIdAndSpec } from '@milaboratory/sdk-model';
import { AxisQualification, ColumnAxesWithQualifications } from './common';

export interface FindColumnsRequest {
  columnSelector: ColumnFilter;
  compatibleWith: ColumnAxesWithQualifications[];
  strictlyCompatible: boolean;
}

export interface FindColumnResponseQualifications {
  forQueries: AxisQualification[][];
  forHit: AxisQualification[];
}

export interface FindColumnsMappingVariant {
  qualifications: FindColumnResponseQualifications;
  distinctiveQualifications: FindColumnResponseQualifications;
}

export interface FindColumnsResponseHit {
  hit: PColumnIdAndSpec;
  mappingVariants: FindColumnsMappingVariant[];
}

export interface FindColumnsResponse {
  hits: FindColumnsResponseHit[];
}
