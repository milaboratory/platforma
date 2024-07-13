import { PColumnSpec, ValueType } from '../drivers';
import { PObjectSpec } from './spec';

export type PSpecPredicate = {
  type: 'and' | 'or',
  operands: PSpecPredicate[]
} | {
  type: 'not',
  operand: PSpecPredicate
} | {
  type: 'name',
  name: string
} | {
  type: 'name_pattern',
  pattern: string
} | {
  type: 'annotation',
  annotation: string,
  value: string
} | {
  type: 'annotation_pattern',
  annotation: string,
  pattern: string
} | {
  type: 'has_axes',
  axes: Partial<AxisId>[]
}

export type AxisId = {
  type: ValueType,
  name: string,
  domains: Record<string, string>
}

export function isPColumnSpec(spec: PObjectSpec): spec is PColumnSpec {
  return spec.kind === 'PColumn';
}

function assertNever(x: never): never {
  throw new Error('Unexpected object: ' + x);
}

export function executePSpecPredicate(predicate: PSpecPredicate, spec: PObjectSpec): boolean {
  switch (predicate.type) {
    case 'and':
      for (const operator of predicate.operands)
        if (!executePSpecPredicate(operator, spec))
          return false;
      return true;
    case 'or':
      for (const operator of predicate.operands)
        if (executePSpecPredicate(operator, spec))
          return true;
      return false;
    case 'not':
      return !executePSpecPredicate(predicate.operand, spec);
    case 'name':
      return isPColumnSpec(spec)
        && spec.name === predicate.name;
    case 'name_pattern':
      return isPColumnSpec(spec)
        && Boolean(spec.name.match(predicate.pattern));
    case 'annotation':
      return isPColumnSpec(spec) && spec.annotations !== undefined
        && spec.annotations[predicate.annotation] === predicate.value;
    case 'annotation_pattern':
      return isPColumnSpec(spec) && spec.annotations !== undefined
        && spec.annotations[predicate.annotation] !== undefined
        && Boolean(spec.annotations[predicate.annotation].match(predicate.pattern));
    case 'has_axes':
      return isPColumnSpec(spec) && predicate.axes.every(matcher =>
        spec.axesSpec.some(axisSpec =>
          (matcher.type === undefined || matcher.type === axisSpec.type)
          && (matcher.name === undefined || matcher.name === axisSpec.name)
          && (matcher.domains === undefined
            || Object.keys(matcher.domains).length === 0
            || (axisSpec.domain !== undefined
              && Object.entries(matcher.domains)
                .every(([domain, domainValue]) =>
                  axisSpec.domain![domain] === domainValue))
          ))
      );
    default:
      assertNever(predicate);
  }
}
