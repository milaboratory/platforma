import * as util from 'node:util';
import { z } from 'zod';

// TODO: add static assertType to parsed_error

// ErrorLike is not defined in a standard zod way (schema + infer type)
// because of zod's workarounds to recursive data types.
// See: https://zod.dev/?id=recursive-types

// TODO: this probably could be passed to pl-errors

export type StandardErrorLike = {
  type: 'StandardError';
  name: string;
  message: string;
  stack?: string;
  cause?: ErrorLike;
  errors?: ErrorLike[];
}

export type PlErrorLike = {
  type: 'PlError';
  name: string;
  message: string;
  stack?: string;
  cause?: ErrorLike;
  errors?: ErrorLike[];
}

export type ErrorLike = StandardErrorLike | PlErrorLike;

// export const BaseStandardErrorLike = z.object({
//   type: z.literal('StandardError').readonly(),
//   name: z.string().readonly(),
//   message: z.string().readonly(),
//   stack: z.string().optional().readonly(),
// });

// export type StandardErrorLike = z.infer<typeof BaseStandardErrorLike> & {
//   readonly cause?: StandardErrorLike;
//   /** Happens in AggregateErrors. */
//   readonly errors?: StandardErrorLike;
// };

// export const StandardlErrorLike: z.ZodType<StandardErrorLike> = BaseStandardErrorLike.extend({
//   cause: z.lazy(() => StandardlErrorLike).optional().readonly(),
//   errors: z.lazy(() => z.array(StandardlErrorLike)).optional().readonly(),
// });

// export const BasePlErrorLike = z.object({
//   type: z.literal('PlError').readonly(),
//   name: z.string().readonly(),
//   message: z.string().readonly(),
//   stack: z.string().optional().readonly(),
// });

// export type PlErrorLike = z.infer<typeof BasePlErrorLike> & {
//   readonly cause: PlErrorLike;
//   readonly errors?: PlErrorLike[];
// }

// export const PlErrorLike: z.ZodType<PlErrorLike> = BasePlErrorLike.extend({
//   cause: z.lazy(() => PlErrorLike).readonly(),
//   errors: z.lazy(() => z.array(PlErrorLike)).optional().readonly(),
// });

// export const ErrorLike = z.union([StandardErrorLike, PlErrorLike]);

// export type ErrorLike = z.infer<typeof ErrorLike>;

/** Represents a shape of our custom defined error.
 * It looks like Error class but with sub errors.
 * ipc electron // TODO
 */
// export type ErrorLike = z.infer<typeof BaseErrorLike> & {
//   subErrors?: ErrorLike[];
//   cause?: ErrorLike;
// };


// const Error = z.object({
//   name: z.literal('Error'),
//   message: z.string(),
// })

// export type ErrorLike = | { name: "Error"; message: string; opt?: undefined } | { name: "Error2"; message: string; opt: string };

// export const ErrorLike: z.ZodType<ErrorLike> = z.union([

// ])

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
      }
    }

    return {
      type: 'StandardError',
      name: err.name,
      message: err.message,
      stack: err.stack ?? undefined,
      cause: err.cause ? ensureErrorLike(err.cause) : undefined,
      errors: err.errors ? err.errors.map(ensureErrorLike) : undefined,
    }
  }

  return {
    type: 'StandardError',
    name: "Error",
    message: String(error)
  }
  return util.inspect(error);
}
