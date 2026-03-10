import type { Equal, Expect, OmitOverUnion } from "@milaboratories/helpers";
import type { BlockOutputsBase, ErrorLike, OutputWithStatus } from "@platforma-sdk/model";
import type { Component, ComputedGetter } from "vue";

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
  readonly valid: boolean;
  readonly isChanged: boolean;
  readonly error: Error | undefined;
  readonly errorString: string | undefined;
  readonly save: () => void;
  readonly revert: () => void;
  readonly setError: (cause: unknown) => void;
};

interface ReadableComputed<T> {
  get: ComputedGetter<T>;
}

export type StripLastSlash<S extends string> = S extends `${infer Stripped}/` ? Stripped : S;

export type ParsePathnamePart<S extends string> = S extends `${infer Path}?${string}`
  ? StripLastSlash<Path>
  : S;

export type ParseQueryPart<S extends string> = S extends `${string}?${infer Query}` ? Query : "";

export type QueryChunks<S extends string> = S extends `${infer Chunk}&${infer Rest}`
  ? Chunk | QueryChunks<Rest>
  : S;

export type SplitChunks<S extends string> = S extends `${infer Key}=${infer Value}`
  ? [Key, Value]
  : never;

export type ParseQuery<QueryString extends string> = {
  [T in SplitChunks<QueryChunks<ParseQueryPart<QueryString>>> as T[0]]: T[1];
};

export type Routes<Href extends `/${string}` = `/${string}`> = {
  [P in Href as ParsePathnamePart<P>]: Component;
};

export type RouteParams<Href extends `/${string}` = `/${string}`> = {
  [P in Href as ParsePathnamePart<P>]: ParseQuery<P>;
};

export type AppSettings = {
  /**
   * App ID (just for debugging)
   */
  appId?: string;
  /**
   * Enables some debug logs
   */
  debug?: boolean;
  /**
   * Debounce span in ms (default is 200ms)
   */
  debounceSpan?: number;
  /**
   * Debounce max wait in ms (default is 1000ms)
   */
  debounceMaxWait?: number;
};

export type ExtendSettings<Href extends `/${string}` = `/${string}`> = {
  /**
   * Displays a loader on top of the block.
   * - If `true`: Shows an infinite loader.
   * - If a number (0 <= n < 1): Displays a progress bar representing completion percentage.
   * - If a number (n > 1): Hides the progress bar.
   * - If `undefined`: No loader is displayed.
   */
  progress?: () => number | boolean | undefined;
  /**
   * Enables or disables a notification box for error messages.
   * - If `true`: A notification box appears when there are errors in the outputs.
   * - If `false`: No notification box is shown.
   */
  showErrorsNotification?: boolean;
  /**
   * Maps application routes to their respective components.
   * TODO: Consider moving route initialization logic to a dedicated method.
   */
  routes: Routes<Href>;
};

// Results (ValueOrErrors)

export type UnwrapValueOrError<W> = W extends {
  ok: true;
  value: infer V;
}
  ? V
  : never;

export type UnwrapOutputs<
  Outputs extends BlockOutputsBase,
  K extends keyof Outputs = keyof Outputs,
> = {
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

export type OutputValues<Outputs extends BlockOutputsBase> = {
  [P in keyof Outputs]: Outputs[P] extends { __unwrap: true }
    ? UnwrapValueOrError<Outputs[P]> | undefined
    : OmitOverUnion<Outputs[P], "__unwrap">;
};

export type OutputErrors<Outputs extends BlockOutputsBase> = {
  [P in keyof Outputs]?: Error;
};

/**
 * @deprecated
 */
export type OptionalResult<T> =
  | {
      errors?: undefined;
      value?: T; // I make this optional (wip)
    }
  | {
      value?: undefined;
      errors: ErrorLike[];
    };

// Static tests

type _cases = [Expect<Equal<number, UnwrapValueOrError<OutputWithStatus<number>>>>];
