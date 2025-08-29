import type { Expression } from '@milaboratories/ptabler-js';
import type { FilterUi } from '../filters';

export type AnnotationSpec<T extends Expression = Expression> = {
  label: string;
  expression: T;
};

export type AnnotationSpecUi = {
  id?: number;
  label: string;
  filter: Extract<FilterUi, { type: 'and' | 'or' }>;
};
