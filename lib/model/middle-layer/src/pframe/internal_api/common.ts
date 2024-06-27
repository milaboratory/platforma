import { AxisSpec } from '@milaboratory/sdk-model';
import { SingleAxisSelector } from './selectors';

export interface AxisQualification {
  axis: SingleAxisSelector;
  additionalDomains: Record<string, string>;
}

export interface ColumnAxesWithQualifications {
  axesSpec: AxisSpec[];
  qualifications: AxisQualification[];
}
