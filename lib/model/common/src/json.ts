import canonicalize from 'canonicalize';

type JsonPrimitive = string | number | boolean | null | undefined;

type JsonValue = JsonPrimitive | JsonValue[] | {
  [key: string]: JsonValue;
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type NotAssignableToJson = bigint | symbol | Function;

type JsonCompatible<T> = unknown extends T ? never : {
  [P in keyof T]:
  T[P] extends JsonValue ? T[P] :
    T[P] extends NotAssignableToJson ? never :
      JsonCompatible<T[P]>;
};

export type StringifiedJson<T> = JsonCompatible<T> extends never ? never : string & {
  __json_stringified: T;
};

export function stringifyJson<T>(value: JsonCompatible<T>): StringifiedJson<T> {
  return JSON.stringify(value)! as StringifiedJson<T>;
}

export type CanonicalizedJson<T> = JsonCompatible<T> extends never ? never : string & {
  __json_canonicalized: T;
};

export function canonicalizeJson<T>(value: JsonCompatible<T>): CanonicalizedJson<T> {
  return canonicalize(value)! as CanonicalizedJson<T>;
}

export function parseJson<T>(value: StringifiedJson<T> | CanonicalizedJson<T>): T {
  return JSON.parse(value) as T;
}
