/** Value or errors */
export type ValueOrErrors<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[]; moreErrors: boolean };

/** Base type for block outputs */
export type BlockOutputsBase = Record<string, ValueOrErrors<unknown>>;
