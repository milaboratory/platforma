// Purpose:
//   Add a small randomized delay ("jitter") at the start of each Vitest worker
//   so concurrent heavy operations (e.g., DB transactions) don't burst at t=0.
//
// Key features:
//   - Deterministic jitter via seed + workerId
//   - Config via env or function args
//   - Uniform or exponential distributions
//   - Safe bounds, input sanitation, optional logging

import { parseBool, parseDurationMs, parseInt } from '@milaboratories/helpers';

export type JitterSeed = string | number | undefined;

export interface WorkerJitterOptions {
  enabled?: boolean; /** Master on/off switch (default: true) */
  minMs?: number; /** Lower bound in ms (default: 0) */
  maxMs?: number; /** Upper bound in ms (default: 500) */
  seed?: JitterSeed; /** Determines RNG seed; can be string or number (default: undefined -> non-deterministic fallback) */
  log?: boolean; /** Log the applied delay to console (default: false) */
}

function normalizeOptions(opts?: WorkerJitterOptions): Required<WorkerJitterOptions> {
  const o = { ...opts };
  const enabled = o.enabled ?? true;
  const minMs = Math.max(0, parseInt(o.minMs ?? 0, 0));
  const maxMs = Math.max(minMs, parseInt(o.maxMs ?? 500, 500)); // ensure max >= min
  const seed = (o.seed ?? Date.now());
  const log = o.log ?? false;

  return { enabled, minMs, maxMs, seed, log };
}

/** Build options from process.env */
export function envOptionsFromProcess(env: NodeJS.ProcessEnv = process.env): WorkerJitterOptions {
  return {
    enabled: parseBool(env.VITEST_WORKER_JITTER_ENABLED, true),
    minMs: parseDurationMs(env.VITEST_WORKER_JITTER_MIN_MS, 0),
    maxMs: parseDurationMs(env.VITEST_WORKER_JITTER_MS ?? env.VITEST_WORKER_JITTER_MAX_MS, 500),
    seed: env.VITEST_WORKER_JITTER_SEED,
    log: parseBool(env.VITEST_WORKER_JITTER_LOG, false),
  };
}

/** Try to derive a per-worker identifier across pools ('threads' and 'forks'). */
export function deriveWorkerId(): number {
  // 1) Vitest sets this per worker (string like "1", "2", ...)
  const envId = typeof process !== 'undefined' ? process.env?.VITEST_WORKER_ID : undefined;
  if (envId && /^\d+$/.test(envId)) return Number(envId);

  // 2) Forked workers / Node: unique per process
  if (typeof process !== 'undefined' && typeof process.pid === 'number') return process.pid;

  // 3) Browser build or unknown env
  return 1;
}

/** Simple non-cryptographic seeded PRNG: mulberry32 */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296; // [0,1)
  };
}

/** Combine seed (string/number) with workerId for stable per-worker stream. */
function makeRng(seed: JitterSeed, workerId: number): () => number {
  if (seed === undefined || seed === null || seed === '') {
    // Fallback to Math.random() - non-deterministic but OK if seed is not required
    return Math.random;
  }
  const base
    = typeof seed === 'number'
      ? seed
      : [...String(seed)].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 0);

  // Mix in workerId to avoid all workers picking the same delay
  const mixed = (base ^ (workerId * 0x9E3779B1)) >>> 0;
  return mulberry32(mixed);
}

function pickDelayMs(
  rng: () => number,
  minMs: number,
  maxMs: number,
): number {
  if (maxMs <= minMs) return minMs;

  const span = maxMs - minMs;
  // Default: uniform
  return minMs + Math.floor(rng() * (span + 1));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Public API: apply jitter once at worker start. Safe to call multiple times; only delays once. */
let _applied = false;
export async function applyWorkerJitter(options?: WorkerJitterOptions): Promise<void> {
  if (_applied) return;
  _applied = true;

  const cfg = normalizeOptions(options);
  if (!cfg.enabled) return;

  const workerId = deriveWorkerId();
  const rng = makeRng(cfg.seed, workerId);
  const delay = pickDelayMs(rng, cfg.minMs, cfg.maxMs);

  if (cfg.log) {
    // Example: [vitest-jitter] workerId=7 delayMs=183 dist=uniform seed=abc

    console.log(
      `[vitest-jitter] workerId=${workerId} delayMs=${delay}`
      + (cfg.seed !== undefined ? ` seed="${String(cfg.seed)}"` : ''),
    );
  }

  if (delay > 0) {
    await sleep(delay);
  }
}
