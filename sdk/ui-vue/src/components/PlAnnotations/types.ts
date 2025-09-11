import type { AnnotationSpecUi as _AnnotationSpecUi, FilterSpecUi as _FilterSpecUI } from '@platforma-sdk/model';

export type FilterSpecUI = _FilterSpecUI & {
  id: number;
};

export type AnnotationSpecUi = _AnnotationSpecUi<FilterSpecUI>;
