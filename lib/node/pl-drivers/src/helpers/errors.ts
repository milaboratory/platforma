export class NetworkError extends Error {
  name = 'NetworkError';

  statusCode: number;
  url: string;
  beginning: string;

  constructor(statusCode: number, url: string, beginning: string) {
    super(`Http error: statusCode: ${statusCode} url: ${url.toString()}, beginning of body: ${beginning}`);
    this.statusCode = statusCode;
    this.url = url;
    this.beginning = beginning;
  }
}

export function isNetworkError(error: unknown): error is NetworkError {
  return error instanceof Error && error.name.startsWith('NetworkError');
}

/** Throws when a status code of the downloading URL was in range [400, 500). */
export class NetworkError400 extends NetworkError {
  name = 'NetworkError400';
}

export function isNetworkError400(error: unknown): error is NetworkError400 {
  return error instanceof Error && error.name === 'NetworkError400';
}

/**
 * There are backend versions that return 1 less byte than requested in range.
 * For such cases, this error will be thrown, so client can retry the request.
 * Dowloader will retry the request with one more byte in range.
 */
export class OffByOneError extends Error {
  name = 'OffByOneError';
}

export function isOffByOneError(error: unknown): error is OffByOneError {
  return error instanceof Error && error.name === 'OffByOneError';
}
