import { Dispatcher, request } from 'undici';
import { Readable } from 'node:stream';
import { ReadableStream } from 'node:stream/web';
import { text } from 'node:stream/consumers';

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

    const webBody = Readable.toWeb(body);

    if (statusCode != 200) {
      const textBody = await text(webBody)
      const beginning = textBody.substring(0, Math.min(textBody.length, 1000));

      if (400 <= statusCode && statusCode < 500) {
        throw new NetworkError400(
          `Http error: statusCode: ${statusCode} url: ${url.toString()}, beginning of body: ${beginning}`
        );
      }

      throw new Error(
        `Http error: statusCode: ${statusCode} url: ${url.toString()}`
      );
    }

    return {
      content: webBody,
      size: Number(headers['content-length'])
    };
  }
}
