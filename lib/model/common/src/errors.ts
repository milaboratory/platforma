/**
 * Just for convenience, usually it is an Error with name 'AbortError'
 */
export class AbortError extends Error {
  name = 'AbortError';
}

/**
 * Throw this to show a message without stack trace in UI
 */
export class UiError extends Error {
  name = 'UiError';
}

export function isAbortError(error: unknown): error is Error & { name: 'AbortError' } {
  return error instanceof Error && error.name === 'AbortError';
}

export function hasAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === 'AbortError' || hasAbortError(error.cause);
}

export function isAggregateError(error: unknown): error is AggregateError {
  return error instanceof Error && error.name === 'AggregateError';
}

export class PFrameError extends Error {
  name = 'PFrameError';
}

export function isPFrameError(error: unknown): error is PFrameError {
  return error instanceof Error && error.name === 'PFrameError';
}

export class PFrameDriverError extends PFrameError {
  name = 'PFrameError.Driver';
}

export function isPFrameDriverError(error: unknown): error is PFrameDriverError {
  return error instanceof Error && error.name === 'PFrameError.Driver';
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') {
    return `String value was thrown: ${value}`;
  }

  if (value && typeof value === 'object') {
    try {
      return `Plain object was thrown: ${JSON.stringify(value)}`;
    } catch (jsonError) {
      const errorMessage = jsonError instanceof Error ? jsonError.message : String(jsonError);
      return `Non-serializable object was thrown (JSON.stringify failed: ${errorMessage}): ${String(value)}`;
    }
  }

  return String(`Non-Error value (${typeof value}) was thrown: ${value}`);
}

export function ensureError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }

  return new Error(stringifyValue(value));
}

// Error serialization for IPC/network transmission (Error objects can't be JSON serialized)

export type SerializedError = {
  name: string;
  message: string;
  stack: string | undefined;
  cause?: SerializedError;
};

export function deserializeError(obj: SerializedError): Error {
  const cause = obj.cause ? deserializeError(obj.cause) : undefined;

  const error = new Error(obj.message, cause !== undefined ? { cause } : undefined);
  error.name = obj.name || 'Error';
  error.stack = obj.stack;

  return error;
}

export function serializeError(e: unknown): SerializedError {
  const error = ensureError(e);
  const cause = error.cause ? serializeError(error.cause) : undefined;

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(error.cause !== undefined && { cause }),
  };
}

export type ResultOrError<S, F = Error> = {
  value: S;
  error?: undefined;
} | {
  error: F;
};

export function unwrapResult<T>(result: ResultOrError<T>): T {
  if (result.error) {
    throw result.error;
  }
  return result.value;
}

export function serializeResult<T>(result: ResultOrError<T>): ResultOrError<T, SerializedError> {
  if (result.error) {
    return { error: serializeError(result.error) };
  }
  return { value: result.value };
}

export function deserializeResult<T>(result: ResultOrError<T, SerializedError>): ResultOrError<T> {
  if (result.error) {
    return { error: deserializeError(result.error) };
  }
  return { value: result.value };
}

export function wrapCallback<T>(callback: () => T): ResultOrError<T> {
  try {
    const value = callback();
    return { value };
  } catch (error) {
    return { error: ensureError(error) };
  }
}

export async function wrapAsyncCallback<T>(callback: () => Promise<T>): Promise<ResultOrError<T>> {
  try {
    const value = await callback();
    return { value };
  } catch (error) {
    return { error: ensureError(error) };
  }
}

export function wrapAndSerialize<T>(callback: () => T): ResultOrError<T, SerializedError> {
  const result = wrapCallback(callback);
  return serializeResult(result);
}

export async function wrapAndSerializeAsync<T>(callback: () => Promise<T>): Promise<ResultOrError<T, SerializedError>> {
  const result = await wrapAsyncCallback(callback);
  return serializeResult(result);
}
