import type { ErrorLike, OutputWithStatus } from "@platforma-sdk/model";
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

/** One entry of a validation error's `issues` array. Valibot and zod both carry
 * `message`; they disagree on `path`, which valibot fills with segment objects
 * and zod with the raw keys. */
type SchemaIssue = { message: string; path?: readonly unknown[] };

/** A validation error from any library that follows the `issues` convention.
 * Matched by shape, so a block still validating with zod keeps working. */
export type SchemaError = Error & { issues: readonly SchemaIssue[] };

export const isSchemaError = (err: Error): err is SchemaError => {
  return Array.isArray((err as { issues?: unknown }).issues);
};

const issuePath = (path: readonly unknown[] | undefined): string => {
  if (path === undefined) return "";
  return path
    .map((segment) =>
      typeof segment === "object" && segment !== null && "key" in segment
        ? (segment as { key: unknown }).key
        : segment,
    )
    .join(".");
};

export const formatSchemaError = (err: SchemaError): string => {
  return err.issues
    .map((issue) => {
      const path = issuePath(issue.path);
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
};
