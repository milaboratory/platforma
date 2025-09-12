// @TODO Gleb Zakharov
/* eslint-disable n/no-unsupported-features/node-builtins */
import type { Dispatcher } from 'undici';
import { request } from 'undici';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { TransformStream } from 'node:stream/web';
import { text } from 'node:stream/consumers';
import type { GetContentOptions } from '@milaboratories/pl-model-common';

export type ContentHandler<T> = (content: ReadableStream, size: number) => Promise<T>;

/** Throws when a status code of the downloading URL was in range [400, 500). */
export class NetworkError400 extends Error {
  name = 'NetworkError400';
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

export class RemoteFileDownloader {
  private readonly offByOneServers: string[] = [];

  constructor(public readonly httpClient: Dispatcher) {}

  async withContent<T>(
    url: string,
    reqHeaders: Record<string, string>,
    ops: GetContentOptions,
    handler: ContentHandler<T>,
  ): Promise<T> {
    const headers = { ...reqHeaders };
    const urlOrigin = new URL(url).origin;

    // Add range header if specified
    if (ops.range) {
      const offByOne = this.offByOneServers.includes(urlOrigin);
      headers['Range'] = `bytes=${ops.range.from}-${ops.range.to - (offByOne ? 0 : 1)}`;
    }

    const { statusCode, body, headers: responseHeaders } = await request(url, {
      dispatcher: this.httpClient,
      headers,
      signal: ops.signal,
    });
    ops.signal?.throwIfAborted();

    const webBody = Readable.toWeb(body);
    let handlerSuccess = false;

    try {
      await checkStatusCodeOk(statusCode, webBody, url);
      ops.signal?.throwIfAborted();

      // Some backend versions have a bug where they return more data than requested in range.
      // So we have to manually normalize the stream to the expected size.
      const size = ops.range ? ops.range.to - ops.range.from : Number(responseHeaders['content-length']);
      const normalizedStream = webBody.pipeThrough(new (class extends TransformStream {
        constructor(sizeBytes: number, recordOffByOne: () => void) {
          super({
            transform(chunk: Uint8Array, controller) {
              const truncatedChunk = chunk.slice(0, sizeBytes);
              controller.enqueue(truncatedChunk);
              sizeBytes -= truncatedChunk.length;
              if (!sizeBytes) controller.terminate();
            },
            flush(controller) {
              // Some backend versions have a bug where they return 1 less byte than requested in range.
              // We cannot always request one more byte because if this end byte is the last byte of the file,
              // the backend will return 416 (Range Not Satisfiable). So error is thrown to force client to retry the request.
              if (sizeBytes === 1) {
                recordOffByOne();
                controller.error(new OffByOneError());
              }
            },
          });
        }
      })(size, () => this.offByOneServers.push(urlOrigin)));
      const result = await handler(normalizedStream, size);

      handlerSuccess = true;
      return result;
    } catch (error) {
      // Cleanup on error (including handler errors)
      if (!handlerSuccess && !webBody.locked) {
        try {
          await webBody.cancel();
        } catch {
          // Ignore cleanup errors
        }
      }
      throw error;
    }
  }
}

async function checkStatusCodeOk(statusCode: number, webBody: ReadableStream, url: string) {
  if (statusCode != 200 && statusCode != 206 /* partial content from range request */) {
    const beginning = (await text(webBody)).substring(0, 1000);

    if (400 <= statusCode && statusCode < 500) {
      throw new NetworkError400(
        `Http error: statusCode: ${statusCode} `
        + `url: ${url.toString()}, beginning of body: ${beginning}`);
    }

    throw new Error(`Http error: statusCode: ${statusCode} url: ${url.toString()}`);
  }
}
