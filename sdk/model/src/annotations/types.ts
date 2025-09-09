import type { Expression } from '@milaboratories/ptabler-js';
import type { FilterUi } from '../filters';

export type AnnotationSpecs = {
  title: string;
  specs: AnnotationSpec[];
};

export type AnnotationSpec<T extends Expression = Expression> = {
  name: string;
  expression: T;
};

export type AnnotationSpecsUi = {
  isCreated?: boolean;
  title: string;
  specs: AnnotationSpecUi[];
};

export type AnnotationSpecUi = {
  id?: number;
  label: string;
  filter: Extract<FilterUi, { type: 'and' | 'or' }>;
};
