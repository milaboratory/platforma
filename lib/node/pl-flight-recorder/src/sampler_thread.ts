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
 *
 * Resident size alone understates a process under pressure, because the OS moves
 * its pages into the compressor or out to swap and they stop being resident. The
 * machine's own account of where memory went is therefore sampled alongside it,
 * less often because it costs a subprocess.
 */

import fs from "node:fs";
import os from "node:os";
import { workerData } from "node:worker_threads";
import type { SamplerRecord } from "./events";
import { readMachineMemory } from "./machine_memory";

type SamplerWorkerData = { file: string; intervalMs: number; machineIntervalMs?: number };

const { file, intervalMs, machineIntervalMs = 1000 } = workerData as SamplerWorkerData;
const fd = fs.openSync(file, "a");
let seq = 0;
let peakRss = 0;
let machineDueAt = 0;

setInterval(() => {
  const rss = process.memoryUsage.rss();
  if (rss > peakRss) peakRss = rss;
  const now = Date.now();
  // Taken on the first tick and then on its own schedule, so the curve keeps its
  // sampling rate while the costlier reading stays occasional.
  const machine = now >= machineDueAt ? readMachineMemory() : undefined;
  if (machine) machineDueAt = now + machineIntervalMs;
  const record: SamplerRecord = {
    seq: ++seq,
    t: Math.round(performance.now() * 1000) / 1000,
    wall: now,
    type: "mem-sampler",
    rss,
    peakRss,
    // The kernel's own high-water mark, which no sampling interval can miss.
    maxRss: process.resourceUsage().maxRSS * 1024,
    freeMemory: os.freemem(),
    totalMemory: os.totalmem(),
    ...(machine ? { machine } : {}),
  };
  try {
    fs.writeSync(fd, `${JSON.stringify(record)}\n`);
  } catch {
    // Sampling must never take the application down.
  }
}, intervalMs);
