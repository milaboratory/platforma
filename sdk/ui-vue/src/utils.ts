import type { ErrorLike, OutputWithStatus } from "@platforma-sdk/model";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { OptionalResult } from "./types";

export class UnresolvedError extends Error {
  name = "UnresolvedError";
}

const ensureArray = <T>(value: T | T[]): T[] => {
  return Array.isArray(value) ? value : value ? [value] : [];
};

// @TODO use AggregateError
export class MultiError extends Error {
  name = "MultiError";

  public readonly fullMessage: string;

  constructor(public readonly errors: (ErrorLike | string)[]) {
    errors = ensureArray(errors);
    super(errors.map((e) => (typeof e == "string" ? e : e.message)).join("\n"));
    this.fullMessage = errors
      .map((e) => {
        if (typeof e == "string") {
          return e;
        } else if (e.type == "PlError" && "fullMessage" in e) {
          return e.fullMessage;
        }
        return e.message;
      })
      .join("\n");
  }
}

export function unwrapOutput<V>(output?: OutputWithStatus<V>): V {
  if (!output) {
    throw new UnresolvedError();
  }

  if (!output.ok) {
    throw new MultiError(output.errors);
  }

  return output.value;
}

export function ensureOutputHasStableFlag<T>(output?: OutputWithStatus<T>) {
  if (!output) {
    throw new UnresolvedError();
  }
  if (output.ok) {
    output.stable ??= true;
  }
  return output;
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

/** @deprecated Errors from any Standard Schema library are formatted by `createModel`. */
export const isZodError = (
  err: Error,
): err is Error & { issues: readonly StandardSchemaV1.Issue[] } => {
  return err.name === "ZodError";
};

/** @deprecated Use {@link formatSchemaIssues}. */
export const formatZodError = (err: { issues: readonly StandardSchemaV1.Issue[] }) =>
  formatSchemaIssues(err.issues);

/** Formats Standard Schema issues as `form errors; field:message,message`, grouped by the first path key. */
export const formatSchemaIssues = (issues: readonly StandardSchemaV1.Issue[]): string => {
  const byField = Map.groupBy(issues, (issue) => {
    const segment = issue.path?.[0];
    return typeof segment === "object" ? segment.key : segment;
  });
  return [
    ...(byField.get(undefined) ?? []).map((issue) => issue.message),
    ...byField
      .entries()
      .filter(([field]) => field !== undefined)
      .map(
        ([field, fieldIssues]) =>
          `${String(field)}:${fieldIssues.map((issue) => issue.message).join(",")}`,
      ),
  ].join("; ");
};
