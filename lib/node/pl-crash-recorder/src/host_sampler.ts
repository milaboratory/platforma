import fs from "node:fs";
import path from "node:path";
import { HOST_FILE_PREFIX, type HostRecord } from "./events";

export type HostReading = Omit<HostRecord, "seq" | "t" | "wall" | "type">;

export type HostSamplerOptions = {
  dir: string;
  sessionId: string;
  /**
   * Takes one reading. Supplied by the caller because the useful numbers come
   * from the application framework rather than from Node, and this package must
   * not depend on it.
   */
  read: () => HostReading | Promise<HostReading>;
  /** Sampling period; these readings change slowly and cost more than resident size. */
  intervalMs?: number;
};

export type HostSampler = {
  /** Sibling log this sampler appends to. */
  readonly file: string;
  stop(): void;
};

/**
 * Records what only the host process can measure, beside the session it hosts.
 *
 * Its own file rather than the session log: that log belongs to another thread
 * and has its own descriptor and sequence, and two writers sharing them would
 * corrupt both. Readers join the two by wall clock, as they already do with the
 * memory sampler.
 *
 * This one runs wherever the caller runs, so a blocked host stops it — which is
 * why it supplements the sampler thread rather than replacing it. What it adds
 * is attribution, and attribution a second stale is still attribution.
 */
export function startHostSampler(options: HostSamplerOptions): HostSampler {
  const { dir, sessionId, read, intervalMs = 1000 } = options;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${HOST_FILE_PREFIX}-${sessionId}.ndjson`);
  const fd = fs.openSync(file, "a");
  let seq = 0;
  let writing = false;

  const timer = setInterval(() => {
    // A reading that outlives its interval must not queue up behind itself.
    if (writing) return;
    writing = true;
    void Promise.resolve()
      .then(read)
      .then((reading) => {
        const record: HostRecord = {
          seq: ++seq,
          t: Math.round(performance.now() * 1000) / 1000,
          wall: Date.now(),
          type: "mem-host",
          ...reading,
        };
        fs.writeSync(fd, `${JSON.stringify(record)}\n`);
      })
      .catch(() => {
        // Sampling must never take the application down.
      })
      .finally(() => {
        writing = false;
      });
  }, intervalMs);
  // Unreferenced so a sampler that is never stopped cannot hold the host open.
  timer.unref();

  return {
    file,
    stop: () => {
      clearInterval(timer);
      try {
        fs.closeSync(fd);
      } catch {
        // Closing an already-dead descriptor must not fail shutdown.
      }
    },
  };
}
