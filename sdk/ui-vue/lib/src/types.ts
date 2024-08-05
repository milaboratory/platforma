import type { BlockOutputsBase, ImportFileHandle, Platforma, StorageHandle, ValueOrErrors } from '@milaboratory/sdk-ui';
import type { Component, ComputedGetter } from 'vue';

export type UnwrapValueOrErrors<R extends ValueOrErrors<unknown>> = Extract<R, { ok: true }>['value'];

export interface ArgsModelOptions<A, T = A> {
  transform?: (v: A) => T;
  validate: (v: unknown) => A;
}

export interface ModelOptions<M, V = M> extends ReadableComputed<M> {
  get(): M;
  validate?(v: unknown): V;
  onSave(v: V): void;
  autoSave?: boolean;
  // @todo debounce?: number
}

export type Model<T> = {
  model: T;
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
  storageHandle: StorageHandle;
  files: ImportFileHandle[];
};

export type OutputsErrors<Outputs extends BlockOutputsBase> = {
  [P in keyof Outputs]?: Extract<Outputs[P], { ok: false }>;
};
declare global {
  const platforma: Platforma | undefined;
  interface Window {
    platforma: Platforma | undefined;
  }
}
