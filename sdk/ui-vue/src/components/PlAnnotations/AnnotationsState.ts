import type { SimplifiedUniversalPColumnEntry } from './types';
import { inject, ref, provide, type Ref } from 'vue';

const key = Symbol('AnnotationsState');

type AnnotationsState = {
  columns?: SimplifiedUniversalPColumnEntry[];
  editStepModalIndex?: number;
  addFilterModalIndex?: number;
};

export function provideAnnotationsState(initial: Partial<AnnotationsState> = {}) {
  provide(key, ref<AnnotationsState>(initial));
  return useAnnotationsState();
}

export function useAnnotationsState() {
  return inject<Ref<AnnotationsState>>(key)!;
}
