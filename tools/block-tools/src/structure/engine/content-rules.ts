// Content-rules DSL — builders that mutate the parsed representation
// of a `managed(path, initial, body)` file.
//
// Three active-state kinds correspond to three file flavours:
//   - JSON object  (package.json)            → withManagedBody(obj, body)
//   - YAML Document (pnpm-workspace.yaml)    → withManagedYaml(doc, body)
//   - line list (.gitignore)                 → withManagedLines(lines, body)
//
// Each builder verifies it is invoked under the matching active state
// and throws otherwise. The full inventory matches content-rules.md:
// JSON ensure*/remove*/require*/prune/enforce*/transform; YAML catalog
// management + workspace module paths; gitignore line management.

import { tryGetActiveRunContext } from "./builders";
import type { RunContext, Scope } from "./api";
import {
  deleteAtPath,
  getAtPath,
  hasAtPath,
  reorderTopLevel,
  setAtPath,
  type JsonObject,
} from "./parsers/json";
import { containsEntry, normaliseLine } from "./parsers/lines";
import type { YamlDocument } from "./parsers/yaml";

export type { JsonObject };

/** Allowed dep version strings. Specific versions live in the catalog. */
export type DepVersion = "catalog:" | `workspace:${string}` | "*";

type JsonState = {
  kind: "json";
  obj: JsonObject;
  ctx?: RunContext;
};

type YamlState = {
  kind: "yaml";
  doc: YamlDocument;
  ctx?: RunContext;
  /** Synchronous accessor for prefetched npm latest versions. */
  getLatestVersion?: (packageName: string) => string | undefined;
};

type LinesState = {
  kind: "lines";
  lines: string[];
  ctx?: RunContext;
};

type ActiveState = JsonState | YamlState | LinesState;

let active: ActiveState | undefined;

function requireActive(builder: string): ActiveState {
  if (!active) {
    throw new Error(
      `${builder}() only valid inside a managed(...) body. ` +
        `Move this call inside managed(path, initial, () => {...}).`,
    );
  }
  return active;
}

function requireJson(builder: string): JsonState {
  const a = requireActive(builder);
  if (a.kind !== "json") {
    throw new Error(`${builder}() requires a JSON-managed body; got '${a.kind}'.`);
  }
  return a;
}

function requireYaml(builder: string): YamlState {
  const a = requireActive(builder);
  if (a.kind !== "yaml") {
    throw new Error(`${builder}() requires a YAML-managed body; got '${a.kind}'.`);
  }
  return a;
}

function requireLines(builder: string): LinesState {
  const a = requireActive(builder);
  if (a.kind !== "lines") {
    throw new Error(`${builder}() requires a lines-managed body; got '${a.kind}'.`);
  }
  return a;
}

function ctxOrThrow(state: ActiveState, builder: string): RunContext {
  const c = state.ctx ?? tryGetActiveRunContext();
  if (!c) {
    throw new Error(
      `${builder}() needs a RunContext but none is active. ` +
        `Pass { ctx } via the with-managed-* helper or run inside engine.run(...).`,
    );
  }
  return c;
}

function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// --- Active-context wrappers (used by the runner + Layer-1 helpers) ---

export type WithManagedOpts = {
  ctx?: RunContext;
};

export function withManagedBody(
  obj: JsonObject,
  body: () => void,
  opts: WithManagedOpts = {},
): JsonObject {
  if (active) throw new Error("Nested managed(...) body — engine bug.");
  active = { kind: "json", obj, ctx: opts.ctx };
  try {
    body();
    return obj;
  } finally {
    active = undefined;
  }
}

export type WithManagedYamlOpts = WithManagedOpts & {
  /** Sync accessor for prefetched latest versions. Required for
   *  `bumpCatalogToLatest` to take effect. */
  getLatestVersion?: (packageName: string) => string | undefined;
};

export function withManagedYaml(
  doc: YamlDocument,
  body: () => void,
  opts: WithManagedYamlOpts = {},
): YamlDocument {
  if (active) throw new Error("Nested managed(...) body — engine bug.");
  active = {
    kind: "yaml",
    doc,
    ctx: opts.ctx,
    getLatestVersion: opts.getLatestVersion,
  };
  try {
    body();
    return doc;
  } finally {
    active = undefined;
  }
}

export function withManagedLines(
  lines: string[],
  body: () => void,
  opts: WithManagedOpts = {},
): string[] {
  if (active) throw new Error("Nested managed(...) body — engine bug.");
  active = { kind: "lines", lines, ctx: opts.ctx };
  try {
    body();
    return lines;
  } finally {
    active = undefined;
  }
}

// ============================================================
// JSON builders — `package.json` (and other JSON managed files)
// ============================================================

/** Set the value at `jsonPath` in the active managed JSON object. */
export function ensureField(jsonPath: string, value: unknown): void {
  setAtPath(requireJson("ensureField").obj, jsonPath, value);
}

/** Remove the field at `jsonPath`. With `predicate`, only removes when
 *  the predicate returns true against the current value. */
export function removeField(
  jsonPath: string,
  predicate?: (currentValue: unknown) => boolean,
): void {
  const obj = requireJson("removeField").obj;
  if (!hasAtPath(obj, jsonPath)) return;
  if (predicate) {
    const current = getAtPath(obj, jsonPath);
    if (!predicate(current)) return;
  }
  deleteAtPath(obj, jsonPath);
}

/** Assert a field exists; throw if absent. No mutation. */
export function requireField(jsonPath: string, message?: string): void {
  const obj = requireJson("requireField").obj;
  if (!hasAtPath(obj, jsonPath)) {
    throw new Error(message ?? `requireField: missing field '${jsonPath}'`);
  }
}

/** Merge `entries` into the object at `jsonPath`. Auto-creates the
 *  object if missing. Existing other entries preserved. */
export function ensureFieldEntries(jsonPath: string, entries: Record<string, unknown>): void {
  const obj = requireJson("ensureFieldEntries").obj;
  const current = hasAtPath(obj, jsonPath) ? getAtPath(obj, jsonPath) : undefined;
  const base: JsonObject = isObject(current) ? current : {};
  for (const [k, v] of Object.entries(entries)) base[k] = v;
  if (!isObject(current)) setAtPath(obj, jsonPath, base);
}

// scripts.<name>
export function ensureScript(name: string, command: string): void {
  ensureField(`scripts.${name}`, command);
}

export function removeScript(name: string): void {
  removeField(`scripts.${name}`);
}

// --- Dependency builders ---

const DEP_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;
type DepSection = (typeof DEP_SECTIONS)[number];

function ensureInSection(
  builder: string,
  name: string,
  version: DepVersion,
  section: DepSection,
): void {
  const obj = requireJson(builder).obj;
  // Single-section invariant: remove from any other section first.
  for (const s of DEP_SECTIONS) {
    if (s === section) continue;
    const sec = obj[s];
    if (isObject(sec) && name in sec) delete sec[name];
  }
  const existing = obj[section];
  const target: JsonObject = isObject(existing) ? existing : {};
  target[name] = version;
  if (!isObject(existing)) obj[section] = target;
}

export function ensureDep(name: string, version: DepVersion): void {
  ensureInSection("ensureDep", name, version, "dependencies");
}

export function ensureDevDep(name: string, version: DepVersion): void {
  ensureInSection("ensureDevDep", name, version, "devDependencies");
}

export function ensurePeerDep(name: string, version: DepVersion): void {
  ensureInSection("ensurePeerDep", name, version, "peerDependencies");
}

export function ensureOptionalDep(name: string, version: DepVersion): void {
  ensureInSection("ensureOptionalDep", name, version, "optionalDependencies");
}

export function removeDep(name: string): void {
  const obj = requireJson("removeDep").obj;
  for (const s of DEP_SECTIONS) {
    const sec = obj[s];
    if (isObject(sec) && name in sec) delete sec[name];
  }
}

export function ensureDeps(entries: Record<string, DepVersion>): void {
  for (const [n, v] of Object.entries(entries)) ensureDep(n, v);
}

export function ensureDevDeps(entries: Record<string, DepVersion>): void {
  for (const [n, v] of Object.entries(entries)) ensureDevDep(n, v);
}

export function ensurePeerDeps(entries: Record<string, DepVersion>): void {
  for (const [n, v] of Object.entries(entries)) ensurePeerDep(n, v);
}

export function ensureOptionalDeps(entries: Record<string, DepVersion>): void {
  for (const [n, v] of Object.entries(entries)) ensureOptionalDep(n, v);
}

function ensureWorkspaceScopeIn(builder: string, scope: Scope, section: DepSection): void {
  const state = requireJson(builder);
  const ctx = ctxOrThrow(state, builder);
  for (const m of ctx.modules) {
    if (m.scope === scope) {
      ensureInSection(builder, m.name, "workspace:*", section);
    }
  }
}

export function ensureWorkspaceScopeDeps(scope: Scope): void {
  ensureWorkspaceScopeIn("ensureWorkspaceScopeDeps", scope, "dependencies");
}

export function ensureWorkspaceScopeDevDeps(scope: Scope): void {
  ensureWorkspaceScopeIn("ensureWorkspaceScopeDevDeps", scope, "devDependencies");
}

export function ensureWorkspaceScopePeerDeps(scope: Scope): void {
  ensureWorkspaceScopeIn("ensureWorkspaceScopePeerDeps", scope, "peerDependencies");
}

// --- Prune ---

export function pruneKeysMatching(predicate: (key: string, value: unknown) => boolean): void {
  const obj = requireJson("pruneKeysMatching").obj;
  for (const k of Object.keys(obj)) {
    if (predicate(k, obj[k])) delete obj[k];
  }
}

export function pruneKeysMatchingAt(
  jsonPath: string,
  predicate: (key: string, value: unknown) => boolean,
): void {
  const obj = requireJson("pruneKeysMatchingAt").obj;
  const sub = getAtPath(obj, jsonPath);
  if (!isObject(sub)) return;
  for (const k of Object.keys(sub)) {
    if (predicate(k, sub[k])) delete sub[k];
  }
}

// --- Field order ---

function applyOrderInPlace(o: JsonObject, order: readonly string[]): void {
  const reordered = reorderTopLevel(o, order);
  for (const k of Object.keys(o)) delete o[k];
  for (const k of Object.keys(reordered)) o[k] = reordered[k];
}

export function enforceFieldOrder(orderedKeys: string[]): void {
  applyOrderInPlace(requireJson("enforceFieldOrder").obj, orderedKeys);
}

export function enforceFieldOrderAt(jsonPath: string, orderedKeys: string[]): void {
  const obj = requireJson("enforceFieldOrderAt").obj;
  const sub = getAtPath(obj, jsonPath);
  if (!isObject(sub)) return;
  applyOrderInPlace(sub, orderedKeys);
}

function sortAlphabeticalInPlace(o: JsonObject, recursive: boolean): void {
  const sorted = Object.keys(o).sort();
  const buf: JsonObject = {};
  for (const k of sorted) buf[k] = o[k];
  for (const k of Object.keys(o)) delete o[k];
  for (const k of sorted) {
    o[k] = buf[k];
    if (recursive && isObject(o[k])) sortAlphabeticalInPlace(o[k] as JsonObject, true);
  }
}

export function enforceAlphabeticalOrder(
  jsonPath: string = "",
  opts: { recursive?: boolean } = {},
): void {
  const recursive = opts.recursive ?? false;
  // Default jsonPath="" with recursive:false is a no-op (prevents accidents).
  if (jsonPath === "" && !recursive) return;
  const obj = requireJson("enforceAlphabeticalOrder").obj;
  if (jsonPath === "") {
    sortAlphabeticalInPlace(obj, true);
    return;
  }
  const sub = getAtPath(obj, jsonPath);
  if (!isObject(sub)) return;
  sortAlphabeticalInPlace(sub, recursive);
}

// --- Generic transform escape hatch ---

export function transformAt<T = unknown>(jsonPath: string, transform: (current: T) => T): void {
  const obj = requireJson("transformAt").obj;
  const current = getAtPath(obj, jsonPath) as T;
  const next = transform(current);
  setAtPath(obj, jsonPath, next);
}

// ============================================================
// YAML builders — `pnpm-workspace.yaml`
// ============================================================

/** Set the workspace `packages:` list to all discovered module paths
 *  (sorted lex). Root module ("") emits ".". */
export function ensureWorkspaceModulePaths(): void {
  const state = requireYaml("ensureWorkspaceModulePaths");
  const ctx = ctxOrThrow(state, "ensureWorkspaceModulePaths");
  const paths = ctx.modules.map((m) => (m.path === "" ? "." : m.path)).sort();
  state.doc.setIn(["packages"], paths);
}

function readCatalogString(state: YamlState, name: string): string | undefined {
  const node = state.doc.getIn(["catalog", name]);
  return typeof node === "string" ? node : undefined;
}

/** Strip leading `^` or `~` from `catalog.<name>` (no-op if missing or
 *  already exact). */
export function ensureCatalogPin(name: string): void {
  const state = requireYaml("ensureCatalogPin");
  const cur = readCatalogString(state, name);
  if (cur === undefined) return;
  const stripped = cur.replace(/^[\^~]/, "");
  if (stripped === cur) return;
  state.doc.setIn(["catalog", name], stripped);
}

/** Set `catalog.<name>` to `version` exactly. Creates the entry if
 *  missing. */
export function ensureCatalogVersion(name: string, version: string): void {
  const state = requireYaml("ensureCatalogVersion");
  const cur = readCatalogString(state, name);
  if (cur === version) return;
  state.doc.setIn(["catalog", name], version);
}

/** Same as `ensureCatalogVersion` — declared separately so authors can
 *  signal intent ("override a previous bump") and rely on top-to-bottom
 *  declaration order. */
export function pinCatalogTo(name: string, version: string): void {
  ensureCatalogVersion(name, version);
}

/** Bump every `catalog.*` entry matching `pattern` to the latest version
 *  obtained from the active state's `getLatestVersion` accessor (which
 *  the caller pre-resolves; no network call is made here). */
export function bumpCatalogToLatest(pattern: RegExp): void {
  const state = requireYaml("bumpCatalogToLatest");
  if (!state.getLatestVersion) return;
  const json = state.doc.toJSON() as { catalog?: Record<string, unknown> } | null;
  const catalog = json?.catalog;
  if (!catalog) return;
  for (const name of Object.keys(catalog)) {
    if (!pattern.test(name)) continue;
    const latest = state.getLatestVersion(name);
    if (latest === undefined) continue;
    const cur = readCatalogString(state, name);
    if (cur === latest) continue;
    state.doc.setIn(["catalog", name], latest);
  }
}

// ============================================================
// Lines builders — `.gitignore`
// ============================================================

/** Append each `entry` if not already present (comment-aware equality). */
export function ensureGitignoreEntries(entries: string[]): void {
  const state = requireLines("ensureGitignoreEntries");
  for (const e of entries) {
    if (containsEntry(state.lines, e)) continue;
    state.lines.push(e);
  }
}

/** Drop any line whose normalised form matches any of `patterns`. */
export function removeGitignoreEntries(patterns: RegExp[]): void {
  const state = requireLines("removeGitignoreEntries");
  const kept: string[] = [];
  for (const line of state.lines) {
    const n = normaliseLine(line);
    if (n === "") {
      kept.push(line);
      continue;
    }
    if (patterns.some((p) => p.test(n))) continue;
    kept.push(line);
  }
  state.lines.splice(0, state.lines.length, ...kept);
}
