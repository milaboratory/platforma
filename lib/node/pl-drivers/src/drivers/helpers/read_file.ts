import { ConcurrencyLimitingExecutor } from '@milaboratories/ts-helpers';
import type { RangeBytes } from '@milaboratories/pl-model-common';
import * as fs from 'node:fs';
import { buffer } from 'node:stream/consumers';

// Global concurrency limiter for file reads - limit to 32 parallel reads
const fileReadLimiter = new ConcurrencyLimitingExecutor(32);

/**
 * Reads file content with concurrency limiting and proper error handling.
 * Ensures file descriptors are properly cleaned up even in error cases.
 */
export async function readFileContent(path: string, range?: RangeBytes): Promise<Uint8Array> {
  return await fileReadLimiter.run(async () => {
    const ops: { start?: number; end?: number } = {};
    if (range) {
      ops.start = range.from;
      ops.end = range.to - 1;
    }

    let stream: fs.ReadStream | undefined;
    try {
      stream = fs.createReadStream(path, ops);
      return await buffer(stream);
    } catch (error) {
      if (stream && !stream.destroyed) {
        stream.destroy();
      }
      throw error;
    }
  });
}
