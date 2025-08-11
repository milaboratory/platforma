import type { AxisSpecParam, Spec, SpecUI } from '@milaboratories/milaboratories.file-import-block.model';
import { isEmpty } from 'es-toolkit/compat';
import type { ColumnSpecParam } from '../types/spec';

export function prepareSpec(spec: SpecUI): Spec {
  return withoutEmptyFields({
    ...spec,
    axes: spec.axes.filter((v) => !v.disabled).map((v) => v.payload).map(withoutEmptyFields).map(propogationNames),
    columns: spec.columns.filter((v) => !v.disabled).map((v) => v.payload).map(withoutEmptyFields).map(propogationNames),
  });
}

function withoutEmptyFields<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([_, value]) => !isEmpty(value))) as T;
}

function propogationNames<T extends AxisSpecParam | ColumnSpecParam>(axisSpec: T): T {
  return {
    ...axisSpec,
    spec: {
      ...axisSpec.spec,
      name: axisSpec.spec.name || axisSpec.column,
      annotations: {
        ...axisSpec.spec.annotations,
        'pl7.app/label': axisSpec.spec.annotations?.['pl7.app/label'] || axisSpec.spec.name || axisSpec.column,
      },
    },
  };
}
