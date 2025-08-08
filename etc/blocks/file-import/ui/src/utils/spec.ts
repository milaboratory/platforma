import type { AxisSpecParam, Spec } from '@milaboratories/milaboratories.file-import-block.model';
import { isEmpty } from 'es-toolkit/compat';
import { ColumnSpecParam } from '../types/spec';

export function prepareSpec(spec: Spec): Spec {
  return withoutEmptyFields({
    ...spec,
    axes: spec.axes.map(withoutEmptyFields).map(propogationNames),
    columns: spec.columns.map(withoutEmptyFields).map(propogationNames),
  });
}

function withoutEmptyFields<T extends Record<string, any>>(obj: T): T {
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
            }
        }
    }
}