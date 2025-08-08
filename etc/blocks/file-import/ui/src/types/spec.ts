import type { Spec, ValueType } from "@milaboratories/milaboratories.file-import-block.model";

export type IndexParam = Spec['index'];

export type AxisSpecParam =  Spec['axes'][number];

export type ColumnSpecParam =  Spec['columns'][number];

export const VALUE_TYPE_OPTIONS = [
  { label: 'Int', value: 'Int' as ValueType },
  { label: 'Long', value: 'Long' as ValueType },
  { label: 'Float', value: 'Float' as ValueType },
  { label: 'Double', value: 'Double' as ValueType },
  { label: 'String', value: 'String' as ValueType }
];

export { ValueType };
