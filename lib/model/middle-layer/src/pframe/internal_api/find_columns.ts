import type { ColumnFilter, PColumnIdAndSpec } from '@milaboratories/pl-model-common';
import type { AxisQualification, ColumnAxesWithQualifications } from './common';

export interface FindColumnsRequest {
  columnFilter: ColumnFilter;
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
