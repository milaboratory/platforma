/**
 * Memory sampler, run on its own worker thread.
 *
 * It exists because the thread worth watching is the one that blocks. While the
 * middle layer sits inside a synchronous pframes call its own timers do not
 * fire, so its memory series goes dark exactly while memory is growing fastest.
 * This thread stays responsive and keeps the resident-size curve intact right up
 * to the moment the process dies.
 *
 * `rss` and `freeMemory` are process- and machine-wide and so are meaningful
 * from here. Heap figures are per-isolate and would describe only this thread,
 * so they are deliberately not recorded; the observed thread reports its own.
 */

import fs from "node:fs";
import os from "node:os";
import { workerData } from "node:worker_threads";
import type { SamplerRecord } from "./events";

type SamplerWorkerData = { file: string; intervalMs: number };

const { file, intervalMs } = workerData as SamplerWorkerData;
const fd = fs.openSync(file, "a");
let seq = 0;
let peakRss = 0;

setInterval(() => {
  const rss = process.memoryUsage.rss();
  if (rss > peakRss) peakRss = rss;
  const record: SamplerRecord = {
    seq: ++seq,
    t: Math.round(performance.now() * 1000) / 1000,
    wall: Date.now(),
    type: "mem-sampler",
    rss,
    peakRss,
    freeMemory: os.freemem(),
    totalMemory: os.totalmem(),
  };
  try {
    fs.writeSync(fd, `${JSON.stringify(record)}\n`);
  } catch {
    // Sampling must never take the application down.
  }
}, intervalMs);
