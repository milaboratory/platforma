// @TODO Gleb Zakharov
/* eslint-disable n/no-unsupported-features/node-builtins */
import type { Dispatcher } from "undici";
import { request } from "undici";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { TransformStream } from "node:stream/web";
import { text } from "node:stream/consumers";
import type { GetContentOptions } from "@milaboratories/pl-model-common";
import { OffByOneError, DownloadNetworkError400, DownloadNetworkError } from "./download_errors";

export type ContentHandler<T> = (content: ReadableStream, size: number) => Promise<T>;

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
      headers["Range"] = `bytes=${ops.range.from}-${ops.range.to - (offByOne ? 0 : 1)}`;
    }

    const {
      statusCode,
      body,
      headers: responseHeaders,
    } = await request(url, {
      dispatcher: this.httpClient,
      // Undici automatically sets certain headers, so we need to lowercase user-provided headers
      // to prevent automatic headers from being set and avoid "duplicated headers" error.
      headers: Object.fromEntries(
        Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
      ),
      signal: ops.signal,
      highWaterMark: 1 * 1024 * 1024, // 1MB chunks instead of 64KB, tested to be optimal for Human Aging dataset
    });
    ops.signal?.throwIfAborted();

    const webBody = Readable.toWeb(body);
    let handlerSuccess = false;

    try {
      await checkStatusCodeOk(statusCode, webBody, url);
      ops.signal?.throwIfAborted();

      let result: T | undefined = undefined;

      const contentLength = Number(responseHeaders["content-length"]);
      if (Number.isNaN(contentLength) || contentLength === 0) {
        // Some backend versions have a bug that they are not returning content-length header.
        // In this case `content-length` header is returned as 0.
        // We should not clip the result stream to 0 bytes in such case.
        result = await handler(webBody, 0);
      } else {
        // Some backend versions have a bug where they return more data than requested in range.
        // So we have to manually normalize the stream to the expected size.
        const size = ops.range ? ops.range.to - ops.range.from : contentLength;
        const normalizedStream = webBody.pipeThrough(
          new (class extends TransformStream {
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
          })(size, () => this.offByOneServers.push(urlOrigin)),
        );
        result = await handler(normalizedStream, size);
      }

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
    if (400 <= statusCode && statusCode < 500)
      throw new DownloadNetworkError400(statusCode, url, beginning);
    throw new DownloadNetworkError(statusCode, url, beginning);
  }
}
