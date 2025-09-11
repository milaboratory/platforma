import type { Expression } from '@milaboratories/ptabler-js';
import type { FilterUi } from '../filters';

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

export type FilterSpecUi<T extends FilterUi = Extract<FilterUi, { type: 'and' | 'or' }>> = {
  label: string;
  filter: T;
};
