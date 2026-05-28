// Content-rules DSL — active context + first real builder (`ensureField`).
//
// A `managed(path, initial, body)` body lambda is invoked by the runner
// inside `withManagedBody(parsed, body)`. While the body runs, the
// module-global `activeManagedObject` holds the parsed JSON object the
// builders mutate. After the body returns, the runner serialises the
// (possibly-mutated) object and writes back if it differs from disk.
//
// The full builder set (step 3) lands on the same active-context
// mechanism. Step 2 ships `ensureField` end-to-end so the runner's
// managed pass + post-run recheck have something real to exercise.

import { setAtPath } from "./parsers/json";
import type { JsonObject } from "./parsers/json";

export type { JsonObject };

/** Allowed dep version strings (full type lands in step 3). */
export type DepVersion = "catalog:" | `workspace:${string}` | "*";

let activeManagedObject: JsonObject | undefined;

/** Engine-internal: run `body` with `parsed` installed as the active
 *  managed-body object. Re-entry is rejected — managed bodies must not
 *  nest. */
export function withManagedBody(parsed: JsonObject, body: () => void): JsonObject {
  if (activeManagedObject !== undefined) {
    throw new Error("Nested managed(...) body — engine bug.");
  }
  activeManagedObject = parsed;
  try {
    body();
    return parsed;
  } finally {
    activeManagedObject = undefined;
  }
}

function requireActive(builder: string): JsonObject {
  if (activeManagedObject === undefined) {
    throw new Error(
      `${builder}() only valid inside a managed(...) body. ` +
        `Move this call inside managed(path, initial, () => {...}).`,
    );
  }
  return activeManagedObject;
}

/**
 * Set the value at `jsonPath` in the active managed-body object.
 * Idempotent by construction — second call with the same value is a
 * no-op on the serialised representation.
 */
export function ensureField(jsonPath: string, value: unknown): void {
  const obj = requireActive("ensureField");
  setAtPath(obj, jsonPath, value);
}
