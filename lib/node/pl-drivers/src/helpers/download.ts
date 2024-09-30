import { Dispatcher, request } from 'undici';
import { Readable } from 'node:stream';
import { ReadableStream } from 'node:stream/web';

export interface DownloadResponse {
  content: ReadableStream;
  size: number;
}

/** Throws when a status code of the downloading URL was in range [400, 500). */
export class NetworkError400 extends Error {}

export class DownloadHelper {
  constructor(public readonly httpClient: Dispatcher) {}

  async downloadRemoteFile(
    url: string,
    reqHeaders: Record<string, string>,
    signal?: AbortSignal
  ): Promise<DownloadResponse> {
    const { statusCode, body, headers } = await request(url, {
      dispatcher: this.httpClient,
      headers: reqHeaders,
      signal
    });
    if (400 <= statusCode && statusCode < 500) {
      throw new NetworkError400(
        `Http error: statusCode: ${statusCode} url: ${url.toString()}`
      );
    }
    if (statusCode != 200) {
      throw Error(
        `Http error: statusCode: ${statusCode} url: ${url.toString()}`
      );
    }

    return {
      content: Readable.toWeb(body),
      size: Number(headers['content-length'])
    };
  }
}
