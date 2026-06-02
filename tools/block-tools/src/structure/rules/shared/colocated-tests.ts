// Shared definition for co-located unit-test handling.
//
// A block's model / ui / workflow scope MAY carry co-located vitest unit
// tests (`src/**/*.test.ts`, including nested `src/test/*.test.ts`). The
// structurer wires the vitest `test` script and (for ui/model) node ambient
// types into a scope ONLY when such files are present — so a test-less scope
// stays free of a `test` script it would never run, and a freshly-init'd
// (test-less) block remains a refresh fixpoint.

/** Glob (module-relative) for co-located unit tests in a scope's `src/`. */
export const COLOCATED_TEST_GLOB = "src/**/*.test.ts";
