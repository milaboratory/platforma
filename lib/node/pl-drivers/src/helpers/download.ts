// @TODO Gleb Zakharov
/* eslint-disable n/no-unsupported-features/node-builtins */
import type { Dispatcher } from 'undici';
import { request } from 'undici';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { text } from 'node:stream/consumers';
import type { RangeBytes } from '@milaboratories/pl-model-common';

export interface DownloadOps {
  signal?: AbortSignal;
  range?: RangeBytes;
}

export type ContentHandler<T> = (content: ReadableStream, size: number) => Promise<T>;

/** Throws when a status code of the downloading URL was in range [400, 500). */
export class NetworkError400 extends Error {
  name = 'NetworkError400';
}

export class RemoteFileDownloader {
  constructor(public readonly httpClient: Dispatcher) {}

  async withContent<T>(
    url: string,
    reqHeaders: Record<string, string>,
    ops: DownloadOps,
    handler: ContentHandler<T>,
  ): Promise<T> {
    const headers = { ...reqHeaders };

    // Add range header if specified
    if (ops.range) {
      headers['Range'] = `bytes=${ops.range.from}-${ops.range.to - 1}`;
    }

    const { statusCode, body, headers: responseHeaders } = await request(url, {
      dispatcher: this.httpClient,
      headers,
      signal: ops.signal,
    });

    const webBody = Readable.toWeb(body);
    let handlerSuccess = false;

    try {
      await checkStatusCodeOk(statusCode, webBody, url);
      const size = Number(responseHeaders['content-length']);
      const result = await handler(webBody, size);
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
