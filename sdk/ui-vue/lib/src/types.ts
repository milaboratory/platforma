import type { ImportFileHandle, Platforma, StorageHandle, ValueOrErrors } from '@milaboratory/sdk-ui';
import type { Component, ComputedGetter } from 'vue';

export type UnwrapValueOrErrors<R extends ValueOrErrors<unknown>> = Extract<R, { ok: true }>['value'];

export interface ModelOptions<T, V = T> extends ReadableComputed<T> {
  get(): T;
  validate?(v: unknown): V;
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
  revert: () => void;
};

interface ReadableComputed<T> {
  get: ComputedGetter<T>;
}

export type Routes<Href extends `/${string}` = `/${string}`> = {
  [P in Href]: Component;
};

export type LocalState<Href extends `/${string}` = `/${string}`> = {
  routes: Routes<Href>;
};

export type ImportedFiles = {
  storageId: StorageHandle;
  files: ImportFileHandle[];
};

declare global {
  const platforma: Platforma | undefined;
  interface Window {
    platforma: Platforma | undefined;
  }
}
