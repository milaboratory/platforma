import type { ValueOrErrors } from '@platforma-sdk/model';
import type { OptionalResult } from './types';
import type { ZodError } from 'zod';
import canonicalize from 'canonicalize';

export class UnresolvedError extends Error {}

// @TODO use AggregateError
export class MultiError extends Error {
  constructor(public readonly errors: string[]) {
    super(errors.join('\n'));
  }

  toString() {
    return this.errors.join('\n');
  }
}

export function wrapValueOrErrors<V>(value: V): ValueOrErrors<V> {
  return {
    ok: true,
    value,
  };
}

export function unwrapValueOrErrors<V>(valueOrErrors?: ValueOrErrors<V>): V {
  if (!valueOrErrors) {
    throw new UnresolvedError();
  }

  if (!valueOrErrors.ok) {
    throw new MultiError(valueOrErrors.errors);
  }

  return valueOrErrors.value;
}

// Optional Result

export function wrapOptionalResult<V>(value: V): OptionalResult<V> {
  return {
    value,
    errors: undefined,
  };
}

export function unwrapOptionalResult<V>(result: OptionalResult<V>): V {
  if (result.errors) {
    throw new MultiError(result.errors);
  }

  if (!result.value) {
    throw new UnresolvedError();
  }

  return result.value;
}

export function isDefined<T>(v: T | undefined): v is T {
  return v !== undefined;
}

export function isJsonEqual(a: unknown, b: unknown) {
  return canonicalize(a) === canonicalize(b);
}

export const identity = <T, V = T>(v: T): V => v as unknown as V;

export const ensureError = (cause: unknown) => {
  if (cause instanceof Error) {
    return cause;
  }

  return Error(String(cause));
};

export const isZodError = (err: Error): err is ZodError => {
  return err.name === 'ZodError';
};

export const formatZodError = (err: ZodError) => {
  const { formErrors, fieldErrors } = err.flatten();
  const _fieldErrors = Object.entries(fieldErrors).map(([field, errors]) => {
    return field + ':' + errors?.join(',');
  });
  return formErrors.concat(_fieldErrors).join('; ');
};
