import * as util from 'node:util';
import { z } from 'zod';
import { PlErrorReport } from './parsed_error';

// TODO: add static assertType to parsed_error

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

  // if true, it's most likely an error.
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
    message: util.format(error),
  };
}
