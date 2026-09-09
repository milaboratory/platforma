import path from "node:path";
import { Worker } from "node:worker_threads";
import { SAMPLER_FILE_PREFIX } from "./events";

export type MemorySamplerOptions = {
  dir: string;
  sessionId: string;
  /** Sampling period; 250 ms is roughly four short appends per second. */
  intervalMs?: number;
};

export type MemorySampler = {
  /** Sibling log the sampler appends to. */
  readonly file: string;
  stop(): void;
};

/**
 * Starts the out-of-band memory sampler for a session.
 *
 * The sampler runs on a thread of its own with a small heap of its own, so it
 * keeps producing readings when the observed thread is blocked and when the
 * observed thread's heap is the thing that is full.
 */
export function startMemorySampler(options: MemorySamplerOptions): MemorySampler {
  const { dir, sessionId, intervalMs = 250 } = options;
  const file = path.join(dir, `${SAMPLER_FILE_PREFIX}-${sessionId}.ndjson`);
  const worker = new Worker(new URL("./sampler_thread.js", import.meta.url), {
    workerData: { file, intervalMs },
    resourceLimits: { maxOldGenerationSizeMb: 32 },
  });
  // Unreferenced so a sampler that is never stopped cannot hold the process open.
  worker.unref();
  return {
    file,
    stop: () => {
      void worker.terminate();
    },
  };
}
