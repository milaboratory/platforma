import type { ValueOrErrors } from '@milaboratory/sdk-ui';
import type { OptionalResult } from './types';

export class UnresolvedError extends Error {}

export class MultiError extends Error {
  constructor(public readonly errors: string[]) {
    super();
  }

  // @todo
  toString() {
    return this.errors.join(',');
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
    throw Error(valueOrErrors.errors.join(';'));
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
