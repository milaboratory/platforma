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

// oxfmt formats JSON two ways, keyed on filename:
//   - package.json: every array/object fully expanded, one element per line,
//     regardless of width (what `JSON.stringify(…, 2)` already produces).
//   - any other .json (e.g. tsconfig.json): oxfmt's generic shape —
//       * objects: always expanded, one property per line (oxfmt preserves
//         the brace newline, so the expanded form is a fixpoint);
//       * arrays: collapsed onto one line when that line — its indent, the
//         `"key": ` prefix, the flat array, and a trailing comma if a sibling
//         follows — fits `PRINT_WIDTH` (oxfmt's default 100), else broken one
//         element per line.
//     This is exactly the form `oxfmt` itself produces, verified against
//     oxfmt 0.35 at the array boundary (≤100 collapses, 101 breaks; a
//     trailing comma counts) and across all in-mono blocks. The single-
//     element `include` array was the regression: `JSON.stringify` expanded
//     it while oxfmt collapses it.
// `stringifyJson` defaults to the expanded form; callers serialising a
// generic .json pass `{ collapse: true }` so the output is oxfmt-clean by
// construction (no prior `pnpm fmt` needed for `check` — the same
// emit-clean-by-design contract as the canonical key/dependency ordering).
const PRINT_WIDTH = 100;
const INDENT = 2;

/** One-line rendering of an array, matching oxfmt's flat spacing: `[a, b]`
 *  (no inner padding), nested objects inline as `{ "k": v }`, empty `[]`.
 *  Only arrays collapse, so this is the array-fits primitive. */
function flatArray(value: unknown[]): string {
  if (value.length === 0) return "[]";
  return "[" + value.map(flatValue).join(", ") + "]";
}

/** One-line rendering of any value (used inside a collapsed array, where
 *  contained objects render inline). */
function flatValue(value: unknown): string {
  if (Array.isArray(value)) return flatArray(value);
  if (isObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    return (
      "{ " + entries.map(([k, v]) => `${JSON.stringify(k)}: ${flatValue(v)}`).join(", ") + " }"
    );
  }
  return JSON.stringify(value);
}

/** Print `value` starting at `column`. Objects always break (one property per
 *  line); arrays collapse when their flat line — `column` + the flat array +
 *  `reserved` (1 for a trailing comma when a sibling follows) — fits
 *  `PRINT_WIDTH`, else break. `indent` is the leading-space width of the line
 *  the container opens on. */
function printValue(value: unknown, indent: number, column: number, reserved: number): string {
  const inner = indent + INDENT;
  const pad = " ".repeat(inner);
  if (Array.isArray(value)) {
    const flat = flatArray(value);
    if (column + flat.length + reserved <= PRINT_WIDTH) return flat;
    const last = value.length - 1;
    const lines = value.map((item, i) => pad + printValue(item, inner, inner, i === last ? 0 : 1));
    return "[\n" + lines.join(",\n") + "\n" + " ".repeat(indent) + "]";
  }
  if (isObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    const last = entries.length - 1;
    const lines = entries.map(([k, v], i) => {
      const prefix = `${pad}${JSON.stringify(k)}: `;
      return prefix + printValue(v, inner, prefix.length, i === last ? 0 : 1);
    });
    return "{\n" + lines.join(",\n") + "\n" + " ".repeat(indent) + "}";
  }
  return JSON.stringify(value);
}

/** Canonical serialiser: 2-space indent, trailing newline.
 *  Default — every container expanded (the package.json shape, byte-identical
 *  to `JSON.stringify(…, 2)`).
 *  `{ collapse: true }` — oxfmt's generic-.json shape: containers that fit
 *  `PRINT_WIDTH` collapse onto one line. Used for tsconfig.json and any other
 *  non-package.json the engine emits, so `oxfmt --check` passes without a
 *  prior format pass. */
export function stringifyJson(value: unknown, opts?: { collapse?: boolean }): string {
  if (!opts?.collapse) return JSON.stringify(value, null, 2) + "\n";
  // Normalise through a round-trip so non-JSON inputs (undefined values,
  // functions) are dropped exactly as `JSON.stringify` would.
  const normalized = JSON.parse(JSON.stringify(value ?? null));
  return printValue(normalized, 0, 0, 0) + "\n";
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
