// Content-rules DSL — stub.
//
// Step-1 deliverable: shape only. The bag of `ensure*` / `remove*` /
// `enforce*` builders lives here; full implementations land in step 2
// (one real builder for end-to-end) and step 3 (the full set per
// content-rules.md). For now we export the bag type so `api.ts` is
// stable and downstream rule modules can import it.

/** Parsed-JSON object handed into the body. Builders mutate it. */
export type JsonObject = Record<string, unknown>;

/** Allowed dep version strings. */
export type DepVersion = "catalog:" | `workspace:${string}` | "*";

/**
 * The builder bag passed into managed bodies (step 2+). For step 1
 * the type is declared but no implementations exist — runner is not
 * yet wired up. Test harness in `testing.ts` constructs a stub
 * version of this for unit tests of individual builders.
 */
export type ContentBuilders = {
  ensureField(jsonPath: string, value: unknown): void;
  removeField(jsonPath: string, predicate?: (current: unknown) => boolean): void;
  // ... full inventory in step 3 (see content-rules.md).
};
