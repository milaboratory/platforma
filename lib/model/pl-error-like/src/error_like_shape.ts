import stringify from 'json-stringify-safe';

export type StandardErrorLike = {
  type: 'StandardError';
  name: string;
  message: string;
  stack?: string;
  cause?: ErrorLike;
  errors?: ErrorLike[];
};

export type PlErrorLike = {
  type: 'PlError';
  name: string;
  message: string;
  stack?: string;
  cause?: ErrorLike;
  errors?: ErrorLike[];
};

export type ErrorLike = StandardErrorLike | PlErrorLike;

export function ensureErrorLike(error: unknown): ErrorLike {
  const err = error as any;

  // if true, 99% it's a error.
  if (typeof err === 'object' && err !== null && 'name' in err && 'message' in err) {
    if (err.name === 'ModelError') {
      return {
        type: 'PlError',
        name: err.name,
        message: err.message,
        stack: err.stack ?? undefined,
        cause: err.cause ? ensureErrorLike(err.cause) : undefined,
        errors: err.errors ? err.errors.map(ensureErrorLike) : undefined,
      };
    }

    return {
      type: 'StandardError',
      name: err.name,
      message: err.message,
      stack: err.stack ?? undefined,
      cause: err.cause ? ensureErrorLike(err.cause) : undefined,
      errors: err.errors ? err.errors.map(ensureErrorLike) : undefined,
    };
  }

  return {
    type: 'StandardError',
    name: 'Error',
    // Stringify without circular dependencies.
    // Maps (and sets?) will be converted to empty json objects,
    // if this is a problem, we should change the library,
    // but it must work in all QuickJS, UI and Node.js.
    message: stringify(error),
  };
}
