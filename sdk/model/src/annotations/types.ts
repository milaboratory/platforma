import type { Expression } from '@milaboratories/ptabler-js';
import type { FilterSpec } from '../filters';

export type AnnotationSpec<T extends ExpressionSpec = ExpressionSpec> = {
  title: string;
  steps: T[];
};

export type ExpressionSpec<T extends Expression = Expression> = {
  name: string;
  expression: T;
};

export type AnnotationSpecUi<T extends FilterSpecUi = FilterSpecUi> = {
  title: string;
  steps: T[];
};

export type FilterSpecUi<T extends FilterSpec = Extract<FilterSpec, { type: 'and' | 'or' }>> = {
  label: string;
  filter: T;
};
