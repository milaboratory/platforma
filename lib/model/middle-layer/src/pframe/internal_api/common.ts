import { AxisId, AxisSpec, ValueType } from '@milaboratories/pl-model-common';

export interface SingleAxisSelector {
  name: string;
  type?: ValueType;
  domain?: Record<string, string>;
}

export interface AxisQualification {
  axis: SingleAxisSelector;
  additionalDomains: Record<string, string>;
}

export interface ColumnAxesWithQualifications {
  axesSpec: AxisSpec[];
  qualifications: AxisQualification[];
}

export type ConstantAxisFilter = {
  type: 'constant';
  axisIndex: number;
  constant: string | number;
}
