import canonicalize from 'canonicalize';

type JsonPrimitive = string | number | boolean | null | undefined;

type JsonValue = JsonPrimitive | { toJSON(): JsonValue } | JsonValue[] | {
  [key: string]: JsonValue;
};

export type JsonSerializable = Exclude<JsonValue, undefined>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type NotAssignableToJson = bigint | symbol | Function;

export type JsonCompatible<T> = unknown extends T ? unknown
  : T extends JsonValue ? T
    : {
        [P in keyof T]: T[P] extends JsonValue ? T[P]
          : [Exclude<T[P], undefined>] extends [NotAssignableToJson] ? never
              : JsonCompatible<T[P]>;
      };

export type StringifiedJson<T = unknown> = JsonCompatible<T> extends never ? never : string & {
  __json_stringified: T;
};

export function stringifyJson<T>(value: JsonCompatible<T>): StringifiedJson<T>;
export function stringifyJson<T extends JsonSerializable>(value: T): string;
export function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

export type CanonicalizedJson<T = unknown> = JsonCompatible<T> extends never ? never : string & {
  __json_canonicalized: T;
};

export function canonicalizeJson<T>(value: JsonCompatible<T>): CanonicalizedJson<T>;
export function canonicalizeJson<T extends JsonSerializable>(value: T): string;
export function canonicalizeJson(value: unknown): string {
  return canonicalize(value)!;
}

export function parseJson<T>(value: StringifiedJson<T> | CanonicalizedJson<T>): T {
  return JSON.parse(value) as T;
}

export function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}
