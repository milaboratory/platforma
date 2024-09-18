export type ValueOrError<V, E> =
  | {
      ok: true;
      value: V;
    }
  | {
      ok: false;
      error: E;
    };

export function mapValueInVOE<V1, V2, E>(
  voe: ValueOrError<V1, E>,
  cb: (value: V1) => V2
): ValueOrError<V2, E> {
  return voe.ok ? { ok: true, value: cb(voe.value) } : voe;
}
