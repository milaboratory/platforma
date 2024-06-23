/** Value or errors */
export type ValueOrErrors<T> =
  | { ok: true, value: T }
  | { ok: false, errors: string[], moreErrors: boolean }

export type BlockOutputsBase = Record<string, ValueOrErrors<unknown>>
