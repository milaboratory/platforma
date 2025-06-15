import { type ErrorLike, type ValueOrErrors } from '@platforma-sdk/model';
import type { OptionalResult } from './types';
import type { ZodError } from 'zod';

export class UnresolvedError extends Error {
  name = 'UnresolvedError';
}

// @TODO use AggregateError
export class MultiError extends Error {
  name = 'MultiError';

  public readonly fullMessage: string;

  constructor(public readonly errors: (ErrorLike | string)[]) {
    super(errors.map((e) => typeof e == 'string' ? e : e.message).join('\n'));
    this.fullMessage = errors.map((e) => {
      if (typeof e == 'string') {
        return e;
      } else if (e.type == 'PlError' && 'fullMessage' in e) {
        return e.fullMessage;
      }
      return e.message;
    }).join('\n');
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

export function isDefined<T>(v: T | undefined): v is T {
  return v !== undefined;
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
