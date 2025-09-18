import type { WithImplicitCoercion } from 'node:buffer';

export type Base64Compatible<T> = T extends WithImplicitCoercion<Uint8Array | readonly number[] | string> ? T : never;

export type Base64Encoded<T = unknown> = Base64Compatible<T> extends never ? never : string & {
  __base64_encoded: T;
};

export function base64Encode<T>(value: Base64Compatible<T>): Base64Encoded<T> {
  return Buffer.from(value).toString('base64') as Base64Encoded<T>;
}

export function base64Decode<T extends string>(value: Base64Encoded<T>): T {
  return Buffer.from(value, 'base64').toString() as T;
};
