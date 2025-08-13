import type { AxisSpecParam, ColumnSpecParamUI, Spec, SpecUI } from '@milaboratories/milaboratories.file-import-block.model';
import { isEmpty, isNil } from 'es-toolkit/compat';
import type { XsvMetadata } from '../hooks/useMetadataXsv';
import type { ColumnSpecParam } from '../types/spec';

export function prepareSpec(spec: SpecUI): Spec {
  return withoutEmptyFields({
    ...spec,
    axes: spec.axes.filter((v) => !v.disabled).map((v) => v.payload).map(withoutEmptyFields).map(propagationNames),
    columns: spec.columns.filter((v) => !v.disabled).map((v) => v.payload).map(withoutEmptyFields).map(propagationNames),
  });
}

function withoutEmptyFields<T extends object>(obj: T): T {
  return Object
    .fromEntries(
      Object
        .entries(obj)
        .filter(([_, value]) => typeof value === 'object' ? !isEmpty(value) : !isNil(value)),
    ) as T;
}

function propagationNames<T extends AxisSpecParam | ColumnSpecParam>(axisSpec: T): T {
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

export function autoFillSpecFromMetadata(metadata: XsvMetadata, existingSpec: SpecUI): SpecUI {
  addAllColumns(metadata, existingSpec.columns);

  if (metadata.header.length > 0 && existingSpec.axes.length === 0) {
    existingSpec.axes.push({
      id: `axis-${Date.now()}`,
      expanded: false,
      disabled: false,
      payload: {
        column: metadata.header[0],
        allowNA: false,
        spec: {
          type: metadata.types[metadata.header[0]] ?? 'String',
          name: metadata.header[0],
        },
      },
    });
  }

  return existingSpec;
}

export function addAllColumns(metadata: XsvMetadata, columnsSpecParamsUI: ColumnSpecParamUI[]) {
  return metadata.header.forEach((column) => {
    if (columnsSpecParamsUI.some((c) => c.payload.column === column)) {
      return; // Skip if column already exists
    }

    columnsSpecParamsUI.push({
      id: `column-${Date.now()}-${column}`,
      expanded: false,
      disabled: false,
      payload: {
        column,
        spec: {
          valueType: metadata.types[column] ?? 'String',
          name: column,
        },
      },
    });
  });
}
