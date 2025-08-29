import type { Expression } from '@milaboratories/ptabler-js';
import type { FiltersUi } from '../filters';

// Model state
export type AnnotationScript<T extends AnnotationStep = AnnotationStep> = {
  title: string;
  steps: T[];
};

export type AnnotationStep<T extends Expression = Expression> = {
  label: string;
  expression: T;
};

// UI state
export type AnnotationScriptUI = {
  isCreated?: boolean;
  title: string;
  steps: AnnotationStepUI[];
};

export type AnnotationStepUI = {
  id?: number;
  label: string;
  filter: Extract<FiltersUi, { type: 'and' | 'or' }>;
};
