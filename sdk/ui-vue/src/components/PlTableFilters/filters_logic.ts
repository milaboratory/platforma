import canonicalize from 'canonicalize';
import type {
  PlTableFilterNumberEquals,
  PlTableFilterNumberNotEquals,
  PlTableFilterStringEquals,
  PlTableFilterStringNotEquals,
} from '@platforma-sdk/model';
import {
  type SingleValuePredicateV2,
  type PlTableFilterType,
  type PlTableFilterNumberType,
  type PlTableFilterStringType,
  type PlTableFilter,
  type PTableColumnSpec,
  type PTableColumnId,
  type PlTableFiltersStateEntry,
  type PlTableFilterColumnId,
  getRawPlatformaInstance,
} from '@platforma-sdk/model';
import * as lodash from 'lodash';
import semver from 'semver';
import type { ListOption } from '@milaboratories/uikit';

export function makeColumnId(column: PTableColumnId | PTableColumnSpec): PlTableFilterColumnId {
  return canonicalize(column.id)!;
}

export function getFilterLabel(type: PlTableFilterType): string {
  switch (type) {
    case 'isNotNA':
      return 'Is not NA';
    case 'isNA':
      return 'Is NA';
    case 'number_equals':
    case 'string_equals':
      return 'Equals';
    case 'number_notEquals':
    case 'string_notEquals':
      return 'Not equals';
    case 'number_greaterThan':
      return 'Greater than';
    case 'number_greaterThanOrEqualTo':
      return 'Greater than or equal to';
    case 'number_lessThan':
      return 'Less than';
    case 'number_lessThanOrEqualTo':
      return 'Less than or equal to';
    case 'number_between':
      return 'Between';
    case 'string_contains':
      return 'Contains';
    case 'string_doesNotContain':
      return 'Does not contain';
    case 'string_matches':
      return 'Matches';
    case 'string_doesNotMatch':
      return 'Does not match';
    case 'string_containsFuzzyMatch':
      return 'Contains fuzzy match';
    default:
      throw Error(`unsupported filter type: ${type satisfies never}`);
  }
}

export const filterTypesNumber: PlTableFilterNumberType[] = [
  'isNotNA',
  'isNA',
  'number_equals',
  'number_notEquals',
  'number_greaterThan',
  'number_greaterThanOrEqualTo',
  'number_lessThan',
  'number_lessThanOrEqualTo',
  'number_between',
] as const;

export const filterTypesString: PlTableFilterStringType[] = [
  'isNotNA',
  'isNA',
  'string_equals',
  'string_notEquals',
  'string_contains',
  'string_doesNotContain',
  'string_matches',
  'string_doesNotMatch',
  'string_containsFuzzyMatch',
] as const;

export type PlTableFilterDiscrete =
  | PlTableFilterNumberEquals
  | PlTableFilterNumberNotEquals
  | PlTableFilterStringEquals
  | PlTableFilterStringNotEquals;

export type PlTableFilterDiscreteType = PlTableFilterDiscrete['type'];

export const filterTypesDiscrete: PlTableFilterDiscreteType[] = [
  'number_equals',
  'number_notEquals',
  'string_equals',
  'string_notEquals',
] as const;

export const isFilterDiscreteType = (
  filter: PlTableFilterType,
): filter is PlTableFilterDiscreteType => {
  return (filterTypesDiscrete as PlTableFilterType[]).includes(filter);
};

export const isFilterDiscrete = (filter: PlTableFilter): filter is PlTableFilterDiscrete => {
  return isFilterDiscreteType(filter.type);
};

export function getColumnName(column: PTableColumnSpec, index: string | number) {
  return column.spec.annotations?.['pl7.app/label']?.trim() ?? 'Unlabeled ' + column.type + ' ' + index.toString();
}

export function getFilterReference(filter: PlTableFilter): undefined | number | string {
  const type = filter.type;
  switch (type) {
    case 'isNotNA':
    case 'isNA':
      return undefined;
    case 'number_equals':
    case 'number_notEquals':
    case 'number_greaterThan':
    case 'number_greaterThanOrEqualTo':
    case 'number_lessThan':
    case 'number_lessThanOrEqualTo':
      return filter.reference;
    case 'number_between':
      return filter.lowerBound;
    case 'string_equals':
    case 'string_notEquals':
    case 'string_contains':
    case 'string_doesNotContain':
    case 'string_matches':
    case 'string_doesNotMatch':
    case 'string_containsFuzzyMatch':
      return filter.reference;
    default:
      throw Error(`unsupported filter type: ${type satisfies never}`);
  }
}

export function getFilterDefault(type: PlTableFilterType, reference?: undefined | number | string): PlTableFilter {
  switch (type) {
    case 'isNotNA':
    case 'isNA':
      return { type };
    case 'number_equals':
    case 'number_notEquals':
    case 'number_greaterThan':
    case 'number_greaterThanOrEqualTo':
    case 'number_lessThan':
    case 'number_lessThanOrEqualTo':
      return { type, reference: typeof reference === 'number' ? reference : 0 };
    case 'number_between':
      return {
        type,
        lowerBound: typeof reference === 'number' ? reference : 0,
        includeLowerBound: true,
        upperBound: 100,
        includeUpperBound: false,
      };
    case 'string_equals':
    case 'string_notEquals':
    case 'string_contains':
    case 'string_doesNotContain':
    case 'string_matches':
    case 'string_doesNotMatch':
      return { type, reference: typeof reference === 'string' ? reference : '' };
    case 'string_containsFuzzyMatch':
      return {
        type,
        reference: typeof reference === 'string' ? reference : '',
        maxEdits: 2,
        substitutionsOnly: false,
        wildcard: undefined,
      };
    default:
      throw Error(`unsupported filter type: ${type satisfies never}`);
  }
}

export function changeFilterType(
  filter: PlTableFiltersStateEntry,
  type: PlTableFilterType,
  discreteOptions: ListOption<number | string>[],
): PlTableFiltersStateEntry {
  let reference = getFilterReference(filter.filter);
  if (isFilterDiscreteType(type)
    && discreteOptions !== undefined
    && discreteOptions.length > 0
    && !lodash.find(discreteOptions, (option) => option.value === reference)) {
    reference = discreteOptions[0].value;
  }
  return {
    columnId: filter.columnId,
    filter: getFilterDefault(type, reference),
    disabled: filter.disabled,
  };
}

export function parseNumber(column: PTableColumnSpec, value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw Error('Model value is not a number.');

  const type = column.type === 'column' ? column.spec.valueType : column.spec.type;
  if ((type === 'Int' || type === 'Long') && !Number.isInteger(parsed)) throw Error('Model value is not an integer.');

  const min = column.spec.annotations?.['pl7.app/min'];
  if (min !== undefined) {
    const minValue = Number(min);
    if (Number.isFinite(minValue) && parsed < Number(min)) {
      throw Error('Model value is too low.');
    }
  }

  const max = column.spec.annotations?.['pl7.app/max'];
  if (max !== undefined) {
    const maxValue = Number(max);
    if (Number.isFinite(maxValue) && parsed > Number(max)) {
      throw Error('Model value is too high.');
    }
  }

  return parsed;
}

export function parseString(column: PTableColumnSpec, value: string): string {
  const alphabet = column.spec.domain?.['pl7.app/alphabet'] ?? column.spec.annotations?.['pl7.app/alphabet'];
  if (alphabet === 'nucleotide' && !/^[AaTtGgCcNn]+$/.test(value)) throw Error('Model value is not a nucleotide.');
  if (alphabet === 'aminoacid' && !/^[AaCcDdEeFfGgHhIiKkLlMmNnPpQqRrSsTtVvWwYyXx]+$/.test(value)) throw Error('Model value is not an aminoacid.');
  return value;
}

export function parseRegex(value: string): string {
  try {
    new RegExp(value);
    return value;
  } catch (err: unknown) {
    if (err instanceof SyntaxError) throw Error('Model value is not a regexp.');
    throw err;
  }
}

export function makeWildcardOptions(
  column: PTableColumnSpec,
  reference: string,
): ListOption<string>[] {
  const alphabet = column.spec.domain?.['pl7.app/alphabet']
    ?? column.spec.annotations?.['pl7.app/alphabet'];
  if (alphabet === 'nucleotide') {
    return [{
      label: 'N',
      value: 'N',
    }];
  }
  if (alphabet === 'aminoacid') {
    return [{
      label: 'X',
      value: 'X',
    }];
  }

  const chars = lodash.uniq(reference);
  chars.sort();
  return chars.map((char) => ({
    label: char,
    value: char,
  }));
}

export function makeDiscreteOptions(column: PTableColumnSpec): ListOption<number | string>[] {
  const discreteValuesAnnotation = column.spec.annotations?.['pl7.app/discreteValues'];
  if (!discreteValuesAnnotation) return [];

  const discreteValues: (string | number)[] = JSON.parse(discreteValuesAnnotation);
  return discreteValues.map((v) => ({
    label: v.toString(),
    value: v,
  }));
}

export function makePredicate(column: PTableColumnSpec, filter: PlTableFilter): SingleValuePredicateV2 {
  const alphabetic
    = semver.gt(getRawPlatformaInstance().sdkInfo.sdkVersion, '1.14.0')
    && (column.type === 'column' ? column.spec.valueType : column.spec.type) === 'String'
    && (column.spec.domain?.['pl7.app/alphabet'] ?? column.spec.annotations?.['pl7.app/alphabet']) !== undefined;
  const type = filter.type;
  switch (type) {
    case 'isNotNA':
      return {
        operator: 'Not',
        operand: {
          operator: 'IsNA',
        },
      };
    case 'isNA':
      return {
        operator: 'IsNA',
      };
    case 'number_equals':
      return {
        operator: 'Equal',
        reference: filter.reference,
      };
    case 'string_equals':
      return {
        operator: alphabetic ? 'IEqual' : 'Equal',
        reference: filter.reference as string,
      };
    case 'number_notEquals':
      return {
        operator: 'Not',
        operand: {
          operator: 'Equal',
          reference: filter.reference,
        },
      };
    case 'string_notEquals':
      return {
        operator: 'Not',
        operand: {
          operator: alphabetic ? 'IEqual' : 'Equal',
          reference: filter.reference,
        },
      };
    case 'number_greaterThan':
      return {
        operator: 'Greater',
        reference: filter.reference,
      };
    case 'number_greaterThanOrEqualTo':
      return {
        operator: 'GreaterOrEqual',
        reference: filter.reference,
      };
    case 'number_lessThan':
      return {
        operator: 'Less',
        reference: filter.reference,
      };
    case 'number_lessThanOrEqualTo':
      return {
        operator: 'LessOrEqual',
        reference: filter.reference,
      };
    case 'number_between':
      return {
        operator: 'And',
        operands: [
          {
            operator: filter.includeLowerBound ? 'GreaterOrEqual' : 'Greater',
            reference: filter.lowerBound,
          },
          {
            operator: filter.includeUpperBound ? 'LessOrEqual' : 'Less',
            reference: filter.upperBound,
          },
        ],
      };
    case 'string_contains':
      return {
        operator: alphabetic ? 'StringIContains' : 'StringContains',
        substring: filter.reference,
      };
    case 'string_doesNotContain':
      return {
        operator: 'Not',
        operand: {
          operator: alphabetic ? 'StringIContains' : 'StringContains',
          substring: filter.reference,
        },
      };
    case 'string_matches':
      return {
        operator: 'Matches',
        regex: filter.reference,
      };
    case 'string_doesNotMatch':
      return {
        operator: 'Not',
        operand: {
          operator: 'Matches',
          regex: filter.reference,
        },
      };
    case 'string_containsFuzzyMatch':
      return {
        operator: alphabetic ? 'StringIContainsFuzzy' : 'StringContainsFuzzy',
        reference: filter.reference,
        maxEdits: filter.maxEdits,
        substitutionsOnly: filter.substitutionsOnly,
        wildcard: filter.wildcard,
      };
    default:
      throw Error(`unsupported filter type: ${type satisfies never}`);
  }
}
