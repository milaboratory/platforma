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
