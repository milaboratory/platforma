export type ValueOrError<V, E> =
  | {
      ok: true;
      value: V;
    }
  | {
      ok: false;
      error: E;
    };
