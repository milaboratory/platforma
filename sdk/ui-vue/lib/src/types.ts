import type { ValueOrErrors } from '@milaboratory/sdk-ui';
import type { ComputedGetter } from 'vue';

export type UnwrapValueOrErrors<R extends ValueOrErrors<unknown>> = Extract<R, { ok: true }>['value'];

export interface ModelOptions<T, V = T> extends ReadableComputed<T> {
  get(): T;
  validate?(v: T): V;
  onSave(v: V): void;
  autoSave?: boolean;
  // @todo debounce?: number
}

export type Model<T> = {
  modelValue: T;
  valid: boolean;
  isChanged: boolean;
  error: Error | undefined;
  errorString: string | undefined;
  save: () => void;
};

interface ReadableComputed<T> {
  get: ComputedGetter<T>;
}
