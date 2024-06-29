import { AxisId, AxisSpec } from '@milaboratory/sdk-model';

export interface AxisQualification {
  axis: AxisId;
  additionalDomains: Record<string, string>;
}

export interface ColumnAxesWithQualifications {
  axesSpec: AxisSpec[];
  qualifications: AxisQualification[];
}
