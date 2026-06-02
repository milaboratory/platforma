// Migrations + legacy cleanup live here.
//
// Two patterns coexist (see dsl-example.md § "Compound Migration With
// Folder Rename + Package Update" and § "Legacy-Cleanup Pattern Inside
// `migrations.ts`"):
//
// 1. One-shot migrations gated on filesystem state. Folder renames,
//    cross-cutting one-time transforms. Use `when(pathExists/pathMissing)`
//    to ensure the migration fires once and becomes idempotent on
//    subsequent runs.
//
// 2. Legacy cleanup primitives. Unconditional `removeScript`,
//    `removeDep`, `remove(path)` calls naming artefacts the canonical
//    layout never produces. Idempotent by definition (no-op on absent
//    keys/paths). Each line is a one-way decision once shipped — every
//    block converges.
//
// The legacyCleanup() function below is the home for cleanup rules;
// step 5b experiments grow the rule set against real external blocks.

export function testFrameworkMigration(): void {
  // No active rename-bearing migration in v1. Hold for the test
  // framework rollout (see spec § "Goals" point 7).
}

export function legacyCleanup(): void {
  // Step 5b will populate this with unconditional removeScript /
  // removeDep / remove(path) calls discovered against real external
  // blocks (samples-and-data, mixcr-clonotyping, clonotype-clustering,
  // antibody-sequence-liabilities, sequence-properties).
}
