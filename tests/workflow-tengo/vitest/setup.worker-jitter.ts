// This file is imported by Vitest once per worker (via test.setupFiles).
// It applies a single startup jitter per worker.

import { applyWorkerJitter, envOptionsFromProcess } from '@milaboratories/test-helpers';

// Prefer env-driven config so CI and local runs stay adjustable without code edits.
await applyWorkerJitter(envOptionsFromProcess(process.env));

// If you want to override programmatically, uncomment and tweak:
// await applyWorkerJitter({
//   enabled: true,
//   minMs: 0,
//   maxMs: 400,
//   distribution: 'uniform', // or 'exponential'
//   seed: 'build-42',        // any string/number for reproducible runs
//   log: true,
// });

// Suppress PromiseRejectionHandledWarning for async rejection handling in reactive system
// This is expected behavior when AbortSignals reject promises that get error handlers attached asynchronously
const originalEmit = process.emit;
(process.emit as unknown) = function (event: string, ...args: unknown[]) {
  if (event === 'warning' && args[0] && typeof args[0] === 'object' && 'name' in args[0] && args[0].name === 'PromiseRejectionHandledWarning') {
    return false;
  }
  return originalEmit.apply(process, [event, ...args]);
};
