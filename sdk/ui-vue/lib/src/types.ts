import type { ValueOrErrors } from '@milaboratory/sdk-ui';
import type { Component, ComputedGetter } from 'vue';
import type { Expect, Equal } from '@milaboratory/helpers/types';
import { z } from 'zod';

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

export type Routes = {
  [key: string]: Component;
};

export type LocalState = {
  routes: Routes;
};

/** Tests **/

declare function __createModel<M, V = unknown>(options: ModelOptions<M, V>): Model<M>;

declare const __args: {
  seed: number;
};

const validate = z.coerce.number().int().parse;

type _number = ReturnType<typeof validate>;

const __model1 = __createModel({
  get() {
    return String(__args.seed);
  },
  validate,
  autoSave: true,
  onSave(seed) {
    console.log('save', seed);
  },
});

const __model2 = __createModel({
  get() {
    return __args.seed;
  },
  validate,
  autoSave: true,
  onSave(seed) {
    console.log('save', seed);
  },
});

type __cases = [Expect<Equal<Model<string>, typeof __model1>>, Expect<Equal<Model<number>, typeof __model2>>];
