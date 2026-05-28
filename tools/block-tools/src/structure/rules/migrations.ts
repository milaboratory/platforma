// One-shot migrations live here — `when` blocks at top level, gated on
// filesystem state or `ctx.version`. v1 ships empty: migrations land as
// they become necessary. See dsl-example.md § "Compound Migration With
// Folder Rename + Package Update" for the canonical shape.

export function migrations(): void {
  // No migrations yet.
}
