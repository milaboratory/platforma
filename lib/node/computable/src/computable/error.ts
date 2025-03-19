import * as util from 'node:util';
import { z } from 'zod';

// ErrorLike is not defined in a standard zod way (schema + infer type)
// because of zod's workarounds to recursive data types.
// See: https://zod.dev/?id=recursive-types

export const BaseErrorLike = z.object({
  name: z.string(),
  message: z.string(),
  stack: z.string().optional(),
});

/** Represents a shape of our custom defined error.
 * It looks like Error class but with sub errors.
 * ipc electron // TODO
 */
// export type ErrorLike = z.infer<typeof BaseErrorLike> & {
//   subErrors?: ErrorLike[];
//   cause?: ErrorLike;
// };


const Error = z.object({
  name: z.literal('Error'),
  message: z.string(),
})

export type ErrorLike = | { name: "Error"; message: string; opt?: undefined } | { name: "Error2"; message: string; opt: string };

export const ErrorLike: z.ZodType<ErrorLike> = z.union([

])

export function ensureErrorLike(error: unknown): ErrorLike {
  const result = ErrorLike.safeParse(error);
  if (result.success) {
    return result.data;
  }

  return {
    name: "Error",
    message: String(error)
  }
  return util.inspect(error);
}
