import {
  type SingleValuePredicateV2,
  type SingleValueEqualPredicate,
  type SingleValueOrPredicateV2,
  type SingleValueAndPredicateV2,
  type SingleValueNotPredicateV2,
  type PTableRecordSingleValueFilterV2,
  type PTableRecordFilter,
} from '@milaboratories/pl-model-common';

export function patchInSetFilters(filters: PTableRecordSingleValueFilterV2[]): PTableRecordFilter[] {
  const inSetToOrEqual = (predicate: SingleValuePredicateV2): SingleValuePredicateV2 => {
    if (predicate.operator !== 'InSet') return predicate;
    return {
      operator: 'Or',
      operands: predicate.references.map((reference) => ({
        operator: 'Equal',
        reference,
      } satisfies SingleValueEqualPredicate)),
    } satisfies SingleValueOrPredicateV2;
  };

  const mapSingleValuePredicate = (filter: SingleValuePredicateV2, cb: (predicate: SingleValuePredicateV2) => SingleValuePredicateV2): SingleValuePredicateV2 => {
    const operator = filter.operator;
    switch (operator) {
      case 'And':
        return {
          ...filter,
          operands: filter.operands.map((operand) => mapSingleValuePredicate(operand, cb)),
        } satisfies SingleValueAndPredicateV2;
      case 'Or':
        return {
          ...filter,
          operands: filter.operands.map((operand) => mapSingleValuePredicate(operand, cb)),
        } satisfies SingleValueOrPredicateV2;
      case 'Not':
        return {
          ...filter,
          operand: mapSingleValuePredicate(filter.operand, cb),
        } satisfies SingleValueNotPredicateV2;
      default:
        return cb(filter);
    }
  };

  const mapFilter = (filter: PTableRecordSingleValueFilterV2, cb: (predicate: SingleValuePredicateV2) => SingleValuePredicateV2): PTableRecordSingleValueFilterV2 => {
    return {
      ...filter,
      predicate: mapSingleValuePredicate(filter.predicate, cb),
    } satisfies PTableRecordSingleValueFilterV2;
  };

  return filters.map((filter) => mapFilter(filter, inSetToOrEqual));
}
