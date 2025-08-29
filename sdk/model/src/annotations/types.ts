import type { Expression } from '@milaboratories/ptabler-js';
import type { FiltersUi } from '../filters';

export type AnnotationSpec<T extends Expression = Expression> = {
  label: string;
  expression: T;
};

export type AnnotationSpecUi = {
  id?: number;
  label: string;
  filter: Extract<FiltersUi, { type: 'and' | 'or' }>;
};
