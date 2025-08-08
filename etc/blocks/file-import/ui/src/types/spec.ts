export type ValueType = 'Int' | 'Long' | 'Float' | 'Double' | 'String';

export interface AxisSpecParam {
  column: string;
  filterOutRegex?: string;
  naRegex?: string;
  allowNA?: boolean;
  spec: {
    type: ValueType;
    name?: string;
    domain?: Record<string, string>;
    annotations?: Record<string, string>;
    parentAxes?: number[];
  };
}

export interface ColumnSpecParam {
  column: string;
  filterOutRegex?: string;
  naRegex?: string;
  allowNA?: boolean;
  id?: string;
  spec: {
    valueType: ValueType;
    name?: string;
    domain?: Record<string, string>;
    annotations?: Record<string, string>;
    parentAxes?: number[];
  };
}

export const VALUE_TYPE_OPTIONS = [
  { label: 'Int', value: 'Int' as ValueType },
  { label: 'Long', value: 'Long' as ValueType },
  { label: 'Float', value: 'Float' as ValueType },
  { label: 'Double', value: 'Double' as ValueType },
  { label: 'String', value: 'String' as ValueType }
];
