import * as util from 'util';
import * as stream from 'stream';
import {once} from 'events';
import readline from 'readline';
import type {Readable} from 'node:stream';

export const finished = util.promisify(stream.finished);

// export const pipeline = util.promisify(stream.pipeline);

export const readableToString = (stream: Readable): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });

export const readableToBuffer = (stream: Readable): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });

export async function writeIterableToStream<T>(iterable: Iterable<T>, writable: stream.Writable) {
  for await (const chunk of iterable) {
    if (!writable.write(chunk)) {
      await once(writable, 'drain');
    }
  }
  writable.end();
  await finished(writable);
}

export function readableFromIterable<T>(iterable: Iterable<T>) {
  return stream.Readable.from(iterable);
}

export async function* concatStreams<T>(...iterables: AsyncIterable<T>[]) {
  for (const it of iterables) {
    yield* it;
  }
}

export async function* readByLine(rs: Readable, transform: (line: string) => string | Promise<string>): AsyncGenerator<string, void, unknown> {
  if (rs.destroyed) {
    throw Error('Cannot read destroyed stream');
  }

  const rl = readline.createInterface({
    input: rs,
    terminal: false
  });

  for await (const line of rl) {
    yield await transform(line);
  }

  rs.destroy();
}

export async function* readByLineNumbered(rs: Readable, transform: (line: string) => string | Promise<string>): AsyncGenerator<[number, string], void, unknown> {
  if (rs.destroyed) {
    throw Error('Cannot read destroyed stream');
  }

  let num = 0;

  let chunks: Buffer[] = [];

  for await (const chunk of rs) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);

    while (true) {
      const buffer = Buffer.concat(chunks);
      const endIndex = buffer.indexOf('\n');
      if (endIndex !== -1) {
        yield [++num, await transform(buffer.subarray(0, endIndex).toString())];
        chunks = [];
        chunks.push(buffer.subarray(endIndex + 1));
      } else {
        break;
      }
    }
  }

  rs.destroy();
}
