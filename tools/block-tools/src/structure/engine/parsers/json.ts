// JSON parser + serialiser + jsonPath helpers + top-level key reorder.
//
// `parseJson`/`stringifyJson` are the canonical round-trip primitives the
// managed pass uses. The dot-notation helpers (`getAtPath`, `setAtPath`,
// `hasAtPath`, `deleteAtPath`) back the content-rule builders. `reorderTopLevel`
// implements the "known keys in declared order, unknown keys stay adjacent to
// preceding known key" projection.

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type JsonObject = { [k: string]: unknown };

/** Parse JSON; throws on invalid input. */
export function parseJson(raw: string): unknown {
  return JSON.parse(raw);
}

/** Canonical serialiser: 2-space indent, trailing newline. */
export function stringifyJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

function splitPath(jsonPath: string): string[] {
  if (jsonPath === "" || jsonPath === undefined) return [];
  return jsonPath.split(".");
}

function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Get the value at `jsonPath`. Returns `undefined` if any segment is
 *  missing or not an object. */
export function getAtPath(obj: JsonObject, jsonPath: string): unknown {
  const parts = splitPath(jsonPath);
  let cur: unknown = obj;
  for (const p of parts) {
    if (!isObject(cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

/** True if `jsonPath` resolves to a defined value (including `null`). */
export function hasAtPath(obj: JsonObject, jsonPath: string): boolean {
  const parts = splitPath(jsonPath);
  if (parts.length === 0) return true;
  let cur: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isObject(cur)) return false;
    cur = cur[parts[i]!];
  }
  if (!isObject(cur)) return false;
  return parts[parts.length - 1]! in cur;
}

/** Set `value` at `jsonPath`. Auto-creates intermediate objects. Throws
 *  if a non-object value is on the path (would be silently overwritten
 *  otherwise — caller bug). */
export function setAtPath(obj: JsonObject, jsonPath: string, value: unknown): void {
  const parts = splitPath(jsonPath);
  if (parts.length === 0) {
    throw new Error("setAtPath: jsonPath must be non-empty");
  }
  let cur: JsonObject = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]!;
    const next = cur[k];
    if (next === undefined) {
      const fresh: JsonObject = {};
      cur[k] = fresh;
      cur = fresh;
    } else if (isObject(next)) {
      cur = next;
    } else {
      throw new Error(
        `setAtPath: cannot descend into non-object at '${parts.slice(0, i + 1).join(".")}'`,
      );
    }
  }
  cur[parts[parts.length - 1]!] = value;
}

/** Delete the value at `jsonPath`. No-op if any segment is missing. */
export function deleteAtPath(obj: JsonObject, jsonPath: string): void {
  const parts = splitPath(jsonPath);
  if (parts.length === 0) {
    throw new Error("deleteAtPath: jsonPath must be non-empty");
  }
  let cur: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isObject(cur)) return;
    cur = cur[parts[i]!];
  }
  if (!isObject(cur)) return;
  delete cur[parts[parts.length - 1]!];
}

/**
 * Reorder top-level keys of `obj`:
 *  - Known keys (those listed in `order`) appear in declared order.
 *  - Unknown keys (not in `order`) stay adjacent to the preceding known
 *    key they followed in the source. Unknown keys appearing before any
 *    known key go first, in source order.
 */
export function reorderTopLevel(obj: JsonObject, order: readonly string[]): JsonObject {
  const known = new Set(order);
  const sourceKeys = Object.keys(obj);

  const adjacents = new Map<string, string[]>();
  adjacents.set("", []);
  let anchor = "";
  for (const k of sourceKeys) {
    if (known.has(k)) {
      anchor = k;
      adjacents.set(anchor, []);
    } else {
      adjacents.get(anchor)!.push(k);
    }
  }

  const out: JsonObject = {};
  for (const k of adjacents.get("")!) out[k] = obj[k];
  for (const k of order) {
    if (!(k in obj)) continue;
    out[k] = obj[k];
    for (const u of adjacents.get(k) ?? []) out[u] = obj[u];
  }
  return out;
}
