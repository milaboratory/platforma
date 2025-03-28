import { ErrorLike } from './error_like_shape';

/** Value or errors */
export type ValueOrErrors<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ErrorLike[]; moreErrors: boolean };

/** Base type for block outputs */
export type BlockOutputsBase = Record<string, ValueOrErrors<unknown>>;
