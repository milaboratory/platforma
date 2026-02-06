import { ConcurrencyLimitingExecutor } from "@milaboratories/ts-helpers";
import type { RangeBytes } from "@milaboratories/pl-model-common";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import { Readable } from "node:stream";

// Global concurrency limiter for file reads - limit to 32 parallel reads
const fileReadLimiter = new ConcurrencyLimitingExecutor(32);

/**
 * Reads file content with concurrency limiting and proper error handling.
 * Ensures file descriptors are properly cleaned up even in error cases.
 */
export async function withFileContent<T>({
  path,
  range,
  signal,
  handler,
}: {
  path: string;
  range?: RangeBytes;
  signal?: AbortSignal;
  handler: (content: ReadableStream, size: number) => Promise<T>;
}): Promise<T> {
  return await fileReadLimiter.run(async () => {
    const readOps = {
      start: range?.from,
      end: range?.to !== undefined ? range.to - 1 : undefined,
      signal: signal,
    };
    let stream: fs.ReadStream | undefined;
    let handlerSuccess = false;

    try {
      const stat = await fsp.stat(path);
      stream = fs.createReadStream(path, readOps);
      const webStream = Readable.toWeb(stream);

      const result = await handler(webStream, stat.size);
      handlerSuccess = true;
      return result;
    } catch (error) {
      // Cleanup on error (including handler errors)
      if (!handlerSuccess && stream && !stream.destroyed) {
        stream.destroy();
      }
      throw error;
    }
  });
}
