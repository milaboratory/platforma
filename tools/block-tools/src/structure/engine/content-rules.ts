// Content-rules DSL — stub.
//
// Step-1 deliverable: shape only. The set of content-rule builders
// (`ensure*` / `remove*` / `enforce*` / `transformAt`) is declared
// here as a TypeScript type for stability of `api.ts`; full
// implementations land in step 2 (one real builder for end-to-end)
// and step 3 (the full set per content-rules.md). Like the outer-DSL
// builders, content-rule builders are module-globals that read an
// active managed-body context — the body lambda passed to
// `managed(path, initial, () => { ... })` takes no arguments.

/** Parsed-JSON object the active managed body mutates. */
export type JsonObject = Record<string, unknown>;

/** Allowed dep version strings. */
export type DepVersion = "catalog:" | `workspace:${string}` | "*";

/**
 * Type of the content-rule builder set exposed inside managed bodies
 * (step 2+). For step 1 the type is declared but no implementations
 * exist — the runner is not yet wired up. The test harness in
 * `testing.ts` will construct a stub managed-body context for unit
 * tests of individual builders once they land.
 */
export type ContentBuilders = {
  ensureField(jsonPath: string, value: unknown): void;
  removeField(jsonPath: string, predicate?: (current: unknown) => boolean): void;
  // ... full inventory in step 3 (see content-rules.md).
};
