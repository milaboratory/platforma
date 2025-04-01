import stringify from 'json-stringify-safe';
import { z } from 'zod';

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
  const result = ErrorShape.safeParse(error);

  if (result.success) {
    const err = result.data;

    if (err.name === 'PlQuickJSError'
      || err.name === 'PlErrorReport'
      || err.name === 'PlInternalError'
      || err.name === 'PlTengoError'
      || err.name === 'PlRunnerError'
      || err.name === 'PlMonetizationError') {
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
    // but the new library must work in all QuickJS, UI and Node.js like this one.
    message: stringify(error),
  };
}

// We want to define ErrorShape schema just to parse it above, it's a way to define recursive types in zod.
// https://zod.dev/?id=recursive-types

const baseErrorShape = z.object({
  name: z.string(),
  message: z.string(),
  stack: z.string().optional(),
});

type ErrorShape = z.infer<typeof baseErrorShape> & {
  cause?: ErrorShape;
  errors?: ErrorShape[];
};

const ErrorShape: z.ZodType<ErrorShape> = baseErrorShape.extend({
  cause: z.lazy(() => ErrorShape).optional(),
  errors: z.lazy(() => ErrorShape.array()).optional(),
});
