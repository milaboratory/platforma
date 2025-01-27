import type { Dispatcher } from 'undici';
import { request } from 'undici';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { text } from 'node:stream/consumers';

export interface DownloadResponse {
  content: ReadableStream;
  size: number;
}

/** Throws when a status code of the downloading URL was in range [400, 500). */
export class NetworkError400 extends Error {}

export class RemoteFileDownloader {
  constructor(public readonly httpClient: Dispatcher) {}

  async download(
    url: string,
    reqHeaders: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<DownloadResponse> {
    const { statusCode, body, headers } = await request(url, {
      dispatcher: this.httpClient,
      headers: reqHeaders,
      signal,
    });

    const webBody = Readable.toWeb(body);
    await checkStatusCodeOk(statusCode, webBody, url);

    return {
      content: webBody,
      size: Number(headers['content-length']),
    };
  }
}

async function checkStatusCodeOk(statusCode: number, webBody: ReadableStream<any>, url: string) {
  if (statusCode != 200) {
    const beginning = (await text(webBody)).substring(0, 1000);

    if (400 <= statusCode && statusCode < 500) {
      throw new NetworkError400(
        `Http error: statusCode: ${statusCode} `
        + `url: ${url.toString()}, beginning of body: ${beginning}`);
    }

    throw new Error(`Http error: statusCode: ${statusCode} url: ${url.toString()}`);
  }
}
