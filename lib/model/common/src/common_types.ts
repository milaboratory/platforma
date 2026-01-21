import type { ErrorLike } from '@milaboratories/pl-error-like';

/** Use this as constraint instead of `Function` */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFunction = (...args: any[]) => any;

export type OutputWithStatus<T> =
  | { ok: true; value: T; stable: boolean }
  | { ok: false; errors: ErrorLike[]; moreErrors: boolean };

/** Base type for block outputs */
export type BlockOutputsBase = Record<string, OutputWithStatus<unknown>>;

export type ListOptionBase<T = unknown> = {
  label: string;
  description?: string;
  value: T;
  group?: string;
};
