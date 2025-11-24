export class DownloadNetworkError extends Error {
  name = 'DownloadNetworkError';

  statusCode: number;
  url: string;
  beginning: string;

  constructor(statusCode: number, url: string, beginning: string) {
    super(`Http download error: statusCode: ${statusCode} url: ${url.toString()}, beginning of body: ${beginning}`);
    this.statusCode = statusCode;
    this.url = url;
    this.beginning = beginning;
  }
}

export function isDownloadNetworkError(error: unknown): error is DownloadNetworkError {
  return error instanceof Error && error.name.startsWith('DownloadNetworkError');
}

/** Throws when a status code of the downloading URL was in range [400, 500). */
export class DownloadNetworkError400 extends DownloadNetworkError {
  name = 'DownloadNetworkError400';
}

export function isDownloadNetworkError400(error: unknown): error is DownloadNetworkError400 {
  return error instanceof Error && error.name === 'DownloadNetworkError400';
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
