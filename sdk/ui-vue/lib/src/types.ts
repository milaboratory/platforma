import type { Equal, Expect } from '@milaboratory/helpers/types';
import type { BlockOutputsBase, ValueOrErrors } from '@milaboratory/sdk-ui';
import type { Component, ComputedGetter } from 'vue';

export type UnwrapValueOrErrors<R extends ValueOrErrors<unknown>> = Extract<R, { ok: true }>['value'];
export interface StateModelOptions<A, T = A> {
  transform?: (v: A) => T;
  validate?: (v: unknown) => A;
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

export type StripLastSlash<S extends string> = S extends `${infer Stripped}/` ? Stripped : S;

export type ParsePathnamePart<S extends string> = S extends `${infer Path}?${string}` ? StripLastSlash<Path> : S;

export type ParseQueryPart<S extends string> = S extends `${string}?${infer Query}` ? Query : '';

export type QueryChunks<S extends string> = S extends `${infer Chunk}&${infer Rest}` ? Chunk | QueryChunks<Rest> : S;

export type SplitChunks<S extends string> = S extends `${infer Key}=${infer Value}` ? [Key, Value] : never;

export type ParseQuery<QueryString extends string> = { [T in SplitChunks<QueryChunks<ParseQueryPart<QueryString>>> as T[0]]: T[1] };

export type Routes<Href extends `/${string}` = `/${string}`> = {
  [P in Href as ParsePathnamePart<P>]: Component;
};

export type RouteParams<Href extends `/${string}` = `/${string}`> = {
  [P in Href as ParsePathnamePart<P>]: ParseQuery<P>;
};

export type LocalState<Href extends `/${string}` = `/${string}`> = {
  routes: Routes<Href>;
};

// Results (ValueOrErrors)

export type UnwrapValueOrError<W> = W extends {
  ok: true;
  value: infer V;
}
  ? V
  : never;

export type UnwrapOutputs<Outputs extends BlockOutputsBase, K extends keyof Outputs = keyof Outputs> = {
  [P in K]: UnwrapValueOrError<Outputs[P]>;
};

// Draft
export type ModelResult<T, E = unknown> =
  | {
      ok: true;
      model: T;
    }
  | {
      ok: false;
      error: E;
    };

export type OptionalResult<T> =
  | {
      errors?: undefined;
      value?: T; // I make this optional (wip)
    }
  | {
      value?: undefined;
      errors: string[];
    };

export type OutputValues<Outputs extends BlockOutputsBase> = {
  [P in keyof Outputs]?: UnwrapValueOrError<Outputs[P]>;
};

export type OutputErrors<Outputs extends BlockOutputsBase> = {
  [P in keyof Outputs]?: Error;
};

// declare global {
//   const platforma: Platforma | undefined;
//   interface Window {
//     platforma: Platforma | undefined;
//   }
// }

type _cases = [Expect<Equal<number, UnwrapValueOrError<ValueOrErrors<number>>>>];
