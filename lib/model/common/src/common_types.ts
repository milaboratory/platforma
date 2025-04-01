import type { ErrorLike } from '@milaboratories/pl-error-like';

/** Use this as constraint instead of `Function` */
export type AnyFunction = (...args: any[]) => any;

/** Value or errors */
export type ValueOrErrors<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ErrorLike[]; moreErrors: boolean };

/** Base type for block outputs */
export type BlockOutputsBase = Record<string, ValueOrErrors<unknown>>;
