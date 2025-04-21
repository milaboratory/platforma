import stringify from 'json-stringify-safe';
import { z } from 'zod';

// We want to define StandardErrorLike and PlErrorLike, it's a way to define recursive types in zod.
// https://zod.dev/?id=recursive-types
// We need zod to parse error strings into these objects for keeping new UI and old blocks compatible.

export const BasePlErrorLike = z.object({
  type: z.literal('PlError'),
  name: z.string(),
  message: z.string(),
  /** The message with all details needed for SDK developers. */
  fullMessage: z.string().optional(),
  stack: z.string().optional(),
});

/** Known Pl backend and ML errors. */
export type PlErrorLike = z.infer<typeof BasePlErrorLike> & {
  cause?: ErrorLike;
  errors?: ErrorLike[];
};

export const PlErrorLike: z.ZodType<PlErrorLike> = BasePlErrorLike.extend({
  cause: z.lazy(() => ErrorLike).optional(),
  errors: z.lazy(() => ErrorLike.array()).optional(),
});

const BaseStandardErrorLike = z.object({
  type: z.literal('StandardError'),
  name: z.string(),
  message: z.string(),
  stack: z.string().optional(),
});

/** Others unknown errors that could be thrown by the client. */
export type StandardErrorLike = z.infer<typeof BaseStandardErrorLike> & {
  cause?: ErrorLike;
  errors?: ErrorLike[];
};

export const StandardErrorLike: z.ZodType<StandardErrorLike> = BaseStandardErrorLike.extend({
  cause: z.lazy(() => ErrorLike).optional(),
  errors: z.lazy(() => ErrorLike.array()).optional(),
});

export const ErrorLike = z.union([StandardErrorLike, PlErrorLike]);
export type ErrorLike = z.infer<typeof ErrorLike>;

/** Converts everything into ErrorLike. */
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
        fullMessage: err.fullMessage ?? undefined,
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

/** Tries to parse strings into ErrorLike. It's needed for keeping old blocks compatible with new UI. */
export function parseErrorLikeSafe(err: string): {
  success: true;
  data: ErrorLike;
} | {
  success: false;
  error: Error;
} {
  try {
    return ErrorLike.safeParse(JSON.parse(err));
  } catch (e) {
    return { success: false, error: new Error(`parseErrorLikeSafe: could not parse JSON: ${err}, ${String(e)}`) };
  }
}

// We want to define ErrorShape schema just to parse it above, it's a way to define recursive types in zod.
// https://zod.dev/?id=recursive-types

const baseErrorShape = z.object({
  name: z.string(),
  message: z.string(),
  fullMessage: z.string().optional(),
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
