import stringify from "json-stringify-safe";
import * as v from "valibot";

export const BasePlErrorLike = v.object({
  type: v.literal("PlError"),
  name: v.string(),
  message: v.string(),
  /** The message with all details needed for SDK developers. */
  fullMessage: v.optional(v.string()),
  stack: v.optional(v.string()),
});

/** Known Pl backend and ML errors. */
export type PlErrorLike = v.InferOutput<typeof BasePlErrorLike> & {
  cause?: ErrorLike;
  errors?: ErrorLike[];
};

export const PlErrorLike: v.GenericSchema<PlErrorLike> = v.object({
  ...BasePlErrorLike.entries,
  cause: v.optional(v.lazy(() => ErrorLike)),
  errors: v.optional(v.lazy(() => v.array(ErrorLike))),
});

const BaseStandardErrorLike = v.object({
  type: v.literal("StandardError"),
  name: v.string(),
  message: v.string(),
  stack: v.optional(v.string()),
});

/** Others unknown errors that could be thrown by the client. */
export type StandardErrorLike = v.InferOutput<typeof BaseStandardErrorLike> & {
  cause?: ErrorLike;
  errors?: ErrorLike[];
};

export const StandardErrorLike: v.GenericSchema<StandardErrorLike> = v.object({
  ...BaseStandardErrorLike.entries,
  cause: v.optional(v.lazy(() => ErrorLike)),
  errors: v.optional(v.lazy(() => v.array(ErrorLike))),
});

export const ErrorLike = v.union([StandardErrorLike, PlErrorLike]);
export type ErrorLike = v.InferOutput<typeof ErrorLike>;

/** Converts everything into ErrorLike. */
export function ensureErrorLike(error: unknown): ErrorLike {
  const result = v.safeParse(ErrorShape, error);

  if (result.success) {
    const err = result.output;

    if (
      err.name === "PlQuickJSError" ||
      err.name === "PlErrorReport" ||
      err.name === "PlInternalError" ||
      err.name === "PlTengoError" ||
      err.name === "PlRunnerError" ||
      err.name === "PlMonetizationError"
    ) {
      return {
        type: "PlError",
        name: err.name,
        message: err.message,
        fullMessage: err.fullMessage ?? undefined,
        stack: err.stack ?? undefined,
        cause: err.cause ? ensureErrorLike(err.cause) : undefined,
        errors: err.errors ? err.errors.map(ensureErrorLike) : undefined,
      };
    }

    return {
      type: "StandardError",
      name: err.name,
      message: err.message,
      stack: err.stack ?? undefined,
      cause: err.cause ? ensureErrorLike(err.cause) : undefined,
      errors: err.errors ? err.errors.map(ensureErrorLike) : undefined,
    };
  }

  return {
    type: "StandardError",
    name: "Error",
    // Stringify without circular dependencies.
    // Maps (and sets?) will be converted to empty json objects,
    // if this is a problem, we should change the library,
    // but the new library must work in all QuickJS, UI and Node.js like this one.
    message: stringify(error),
  };
}

/** Tries to parse strings into ErrorLike. It's needed for keeping old blocks compatible with new UI. */
export function parseErrorLikeSafe(err: string):
  | {
      success: true;
      data: ErrorLike;
    }
  | {
      success: false;
      error: Error;
    } {
  try {
    const result = v.safeParse(ErrorLike, JSON.parse(err));
    return result.success
      ? { success: true, data: result.output }
      : { success: false, error: new v.ValiError(result.issues) };
  } catch (e) {
    return {
      success: false,
      error: new Error(`parseErrorLikeSafe: could not parse JSON: ${err}, ${String(e)}`),
    };
  }
}

const baseErrorShape = v.object({
  name: v.string(),
  message: v.string(),
  fullMessage: v.optional(v.string()),
  stack: v.optional(v.string()),
});

type ErrorShape = v.InferOutput<typeof baseErrorShape> & {
  cause?: ErrorShape;
  errors?: ErrorShape[];
};

const ErrorShape: v.GenericSchema<ErrorShape> = v.object({
  ...baseErrorShape.entries,
  cause: v.optional(v.lazy(() => ErrorShape)),
  errors: v.optional(v.lazy(() => v.array(ErrorShape))),
});
