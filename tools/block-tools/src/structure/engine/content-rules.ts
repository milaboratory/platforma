// Content-rules DSL — builders that mutate the parsed representation
// of a `managed(path, initial, body)` file.
//
// Three active-state kinds correspond to three file flavours:
//   - JSON object  (package.json)            → withManagedBody(obj, body)
//   - YAML Document (pnpm-workspace.yaml)    → withManagedYaml(doc, body)
//   - line list (.gitignore)                 → withManagedLines(lines, body)
//
// Each builder verifies it is invoked under the matching active state
// and throws otherwise. The full inventory: JSON
// ensure*/remove*/require*/prune/enforce*/transform; YAML catalog
// management + workspace module paths; gitignore line management.

import { registerInnerWhenHandler, tryGetActiveRunContext } from "./builders";
import type { RunContext, Scope } from "./api";
import type { TriggerContext, TriggerFn } from "./ir";
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

/** Allowed dep version strings. Specific versions live in the catalog.
 *  `"sdk:"` is an authoring abstraction, not an on-disk value: the engine
 *  resolves it at write time (`workspace:*` when `ctx.isSdkInternal`, else
 *  `"catalog:"`) and the resolved literal is what serializes. Use it for
 *  every dep that is a member of the platforma monorepo's pnpm workspace
 *  (the `@platforma-sdk/*` packages + `@milaboratories/ts-builder` /
 *  `ts-configs`). */
export type DepVersion = "catalog:" | "sdk:" | `workspace:${string}` | "*";

/** Resolve the `"sdk:"` sentinel to its on-disk literal. All other
 *  `DepVersion` forms pass through unchanged — `"sdk:"` never serializes. */
export function resolveDepVersion(
  version: DepVersion,
  isSdkInternal: boolean,
): Exclude<DepVersion, "sdk:"> {
  if (version === "sdk:") return isSdkInternal ? "workspace:*" : "catalog:";
  return version;
}

const DEP_SECTION_KEYS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

/** Resolve any `"sdk:"` sentinels in the dep sections of a generated
 *  package.json object, in place. Mirrors `resolveDepVersion` for the
 *  generator (`initial` content) path — the runner calls this on every
 *  `generate()`-produced `.json` value so the sentinel never reaches disk
 *  via a generator. */
export function resolveSdkSentinelsInJson(value: unknown, isSdkInternal: boolean): void {
  if (!isObject(value)) return;
  for (const section of DEP_SECTION_KEYS) {
    const sec = value[section];
    if (!isObject(sec)) continue;
    for (const k of Object.keys(sec)) {
      if (sec[k] === "sdk:") sec[k] = isSdkInternal ? "workspace:*" : "catalog:";
    }
  }
}

type JsonState = {
  kind: "json";
  obj: JsonObject;
  ctx?: RunContext;
  triggerContext?: TriggerContext;
};

type YamlState = {
  kind: "yaml";
  doc: YamlDocument;
  ctx?: RunContext;
  triggerContext?: TriggerContext;
  /** Synchronous accessor for prefetched npm latest versions. */
  getLatestVersion?: (packageName: string) => string | undefined;
};

type LinesState = {
  kind: "lines";
  lines: string[];
  ctx?: RunContext;
  triggerContext?: TriggerContext;
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
  /** Trigger context for `when(...)` calls inside the body. The runner
   *  builds this from the post-structural-pass FS snapshot + run ctx.
   *  Without it, `when(...)` inside the body throws. */
  triggerContext?: TriggerContext;
};

/** Engine-internal: run `body` with `obj` as the active JSON state so the
 *  JSON builders mutate it; returns the mutated object. Exported for tests —
 *  the runner calls this for managed `.json` files. */
export function withManagedBody(
  obj: JsonObject,
  body: () => void,
  opts: WithManagedOpts = {},
): JsonObject {
  if (active) throw new Error("Nested managed(...) body — engine bug.");
  active = { kind: "json", obj, ctx: opts.ctx, triggerContext: opts.triggerContext };
  try {
    body();
    return obj;
  } finally {
    active = undefined;
  }
}

export type WithManagedYamlOpts = WithManagedOpts & {
  /** Sync accessor for prefetched latest versions. Required for
   *  `ensureCatalogLatest` to take effect. */
  getLatestVersion?: (packageName: string) => string | undefined;
};

/** Engine-internal: run `body` with `doc` as the active YAML state (for
 *  `pnpm-workspace.yaml`); returns the mutated document. Exported for tests. */
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
    triggerContext: opts.triggerContext,
    getLatestVersion: opts.getLatestVersion,
  };
  try {
    body();
    return doc;
  } finally {
    active = undefined;
  }
}

/** Engine-internal: run `body` with `lines` as the active line-based state
 *  (for `.gitignore`); returns the mutated lines. Exported for tests. */
export function withManagedLines(
  lines: string[],
  body: () => void,
  opts: WithManagedOpts = {},
): string[] {
  if (active) throw new Error("Nested managed(...) body — engine bug.");
  active = {
    kind: "lines",
    lines,
    ctx: opts.ctx,
    triggerContext: opts.triggerContext,
  };
  try {
    body();
    return lines;
  } finally {
    active = undefined;
  }
}

// --- Inner-when handler registration ---
//
// `when(...)` is exported from `builders.ts`. When the active tree is
// absent (we are inside a managed body, not inside `defineStructure`),
// it delegates here. The handler returns true iff there is an inner
// active state to dispatch against; the caller in `builders.ts` then
// treats the call as handled. Outer/inner dispatch lives in one
// exported `when` symbol — no separate inner-when builder.

registerInnerWhenHandler((trigger: TriggerFn, body: () => void): boolean => {
  if (!active) return false;
  const tctx = active.triggerContext;
  if (!tctx) {
    throw new Error(
      "when() inside a managed(...) body requires a triggerContext. " +
        "The runner supplies it via the `triggerContext` opt to with-managed-*; " +
        "ensure your test/test helper passes one.",
    );
  }
  if (trigger(tctx)) body();
  return true;
});

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

/** Set `scripts.<name>` to `command`. */
export function ensureScript(name: string, command: string): void {
  ensureField(`scripts.${name}`, command);
}

/** Remove `scripts.<name>` if present. */
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
  const state = requireJson(builder);
  const obj = state.obj;
  // Resolve the `sdk:` sentinel against the run mode before writing — it
  // must never reach disk.
  const resolved =
    version === "sdk:"
      ? resolveDepVersion(version, ctxOrThrow(state, builder).isSdkInternal)
      : version;
  // Single-section invariant: remove from any other section first.
  for (const s of DEP_SECTIONS) {
    if (s === section) continue;
    const sec = obj[s];
    if (isObject(sec) && name in sec) delete sec[name];
  }
  const existing = obj[section];
  const target: JsonObject = isObject(existing) ? existing : {};
  target[name] = resolved;
  if (!isObject(existing)) obj[section] = target;
}

/** Pin `name` to `version` in `dependencies`. Enforces the single-section
 *  invariant — `name` may live in only one dependency section, so it is
 *  removed from the others first. A `sdk:` sentinel version is resolved
 *  against the run's `--sdk-internal` flag before it reaches disk. */
export function ensureDep(name: string, version: DepVersion): void {
  ensureInSection("ensureDep", name, version, "dependencies");
}

/** Pin `name` to `version` in `devDependencies` (see {@link ensureDep} for the
 *  single-section + `sdk:` semantics). */
export function ensureDevDep(name: string, version: DepVersion): void {
  ensureInSection("ensureDevDep", name, version, "devDependencies");
}

/** Pin `name` to `version` in `peerDependencies` (see {@link ensureDep}). */
export function ensurePeerDep(name: string, version: DepVersion): void {
  ensureInSection("ensurePeerDep", name, version, "peerDependencies");
}

/** Pin `name` to `version` in `optionalDependencies` (see {@link ensureDep}). */
export function ensureOptionalDep(name: string, version: DepVersion): void {
  ensureInSection("ensureOptionalDep", name, version, "optionalDependencies");
}

/** Remove `name` from every dependency section. */
export function removeDep(name: string): void {
  const obj = requireJson("removeDep").obj;
  for (const s of DEP_SECTIONS) {
    const sec = obj[s];
    if (isObject(sec) && name in sec) delete sec[name];
  }
}

/** Bulk {@link ensureDep} for each `name → version` entry. */
export function ensureDeps(entries: Record<string, DepVersion>): void {
  for (const [n, v] of Object.entries(entries)) ensureDep(n, v);
}

/** Bulk {@link ensureDevDep} for each `name → version` entry. */
export function ensureDevDeps(entries: Record<string, DepVersion>): void {
  for (const [n, v] of Object.entries(entries)) ensureDevDep(n, v);
}

/** Bulk {@link ensurePeerDep} for each `name → version` entry. */
export function ensurePeerDeps(entries: Record<string, DepVersion>): void {
  for (const [n, v] of Object.entries(entries)) ensurePeerDep(n, v);
}

/** Bulk {@link ensureOptionalDep} for each `name → version` entry. */
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

/** Add every discovered module of `scope` as a `workspace:*` entry in
 *  `dependencies` — wires a block's intra-workspace links (e.g. the test
 *  scope depending on the other scopes). Single-section invariant per
 *  {@link ensureDep}. */
export function ensureWorkspaceScopeDeps(scope: Scope): void {
  ensureWorkspaceScopeIn("ensureWorkspaceScopeDeps", scope, "dependencies");
}

/** Like {@link ensureWorkspaceScopeDeps}, into `devDependencies`. */
export function ensureWorkspaceScopeDevDeps(scope: Scope): void {
  ensureWorkspaceScopeIn("ensureWorkspaceScopeDevDeps", scope, "devDependencies");
}

/** Like {@link ensureWorkspaceScopeDeps}, into `peerDependencies`. */
export function ensureWorkspaceScopePeerDeps(scope: Scope): void {
  ensureWorkspaceScopeIn("ensureWorkspaceScopePeerDeps", scope, "peerDependencies");
}

// --- Prune ---

/** Delete every top-level key for which `predicate(key, value)` is true. */
export function pruneKeysMatching(predicate: (key: string, value: unknown) => boolean): void {
  const obj = requireJson("pruneKeysMatching").obj;
  for (const k of Object.keys(obj)) {
    if (predicate(k, obj[k])) delete obj[k];
  }
}

/** Delete every key of the object at `jsonPath` for which
 *  `predicate(key, value)` is true. No-op if the path is not an object. */
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

/** Reorder top-level keys to `orderedKeys`; keys not listed keep their
 *  position relative to the preceding listed key. Typically the LAST call in
 *  a managed body, projecting the canonical field order. */
export function enforceFieldOrder(orderedKeys: string[]): void {
  applyOrderInPlace(requireJson("enforceFieldOrder").obj, orderedKeys);
}

/** Like {@link enforceFieldOrder}, applied to the object at `jsonPath`. No-op
 *  if the path is not an object. */
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

/** Sort keys alphabetically. Called with no args it is a deliberate no-op
 *  (guards against accidental whole-file sorts); pass a `jsonPath` to sort one
 *  object, or `{ recursive: true }` to sort the whole tree. Matches oxfmt's
 *  dependency-section ordering. */
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

/** Escape hatch: replace the value at `jsonPath` with `transform(current)`,
 *  for shapes the typed builders above do not cover. */
export function transformAt<T = unknown>(jsonPath: string, transform: (current: T) => T): void {
  const obj = requireJson("transformAt").obj;
  const current = getAtPath(obj, jsonPath) as T;
  const next = transform(current);
  setAtPath(obj, jsonPath, next);
}

// ============================================================
// YAML builders — `pnpm-workspace.yaml`
// ============================================================

/** Set the workspace `packages:` list to all discovered NON-root module
 *  paths (sorted lex). The block root ("") is discovered implicitly
 *  and is NEVER written to `packages:` — listing "." there breaks turbo's
 *  task graph. Equality-guarded — skips the rewrite when the existing
 *  list already matches, so a YAML round-trip on an already-canonical
 *  file produces zero churn. */
export function ensureWorkspaceModulePaths(): void {
  const state = requireYaml("ensureWorkspaceModulePaths");
  const ctx = ctxOrThrow(state, "ensureWorkspaceModulePaths");
  const paths = ctx.modules
    .filter((m) => m.path !== "")
    .map((m) => m.path)
    .sort();
  const json = state.doc.toJSON() as { packages?: unknown } | null;
  const cur = json?.packages;
  if (Array.isArray(cur) && cur.length === paths.length && cur.every((v, i) => v === paths[i])) {
    return;
  }
  state.doc.setIn(["packages"], paths);
}

function readCatalogString(state: YamlState, name: string): string | undefined {
  const node = state.doc.getIn(["catalog", name]);
  return typeof node === "string" ? node : undefined;
}

/** Add `catalog.<name>` at `version` ONLY if the key is absent. An entry
 *  the block already carries is left untouched — no overwrite, no
 *  downgrade. This is the seeding primitive for curated fixed versions
 *  (`INFRA_CATALOG_FLOOR`, the python runenv pin): on
 *  `refresh --update-deps-only` a missing standard catalog key is added,
 *  while a key the block already pins keeps its own version. To force a
 *  specific version regardless of what is present, use `pinCatalogTo`. */
export function ensureCatalogVersion(name: string, version: string): void {
  const state = requireYaml("ensureCatalogVersion");
  if (readCatalogString(state, name) !== undefined) return;
  state.doc.setIn(["catalog", name], version);
}

/** Set `catalog.<name>` to `version` EXACTLY — creates the entry if
 *  missing, overwrites it (including a downgrade) if present. Use to force
 *  a specific version; with top-to-bottom declaration order a later
 *  `pinCatalogTo` overrides an earlier `ensureCatalogLatest`. Distinct
 *  from `ensureCatalogVersion`, which never touches a present key. */
export function pinCatalogTo(name: string, version: string): void {
  const state = requireYaml("pinCatalogTo");
  if (readCatalogString(state, name) === version) return;
  state.doc.setIn(["catalog", name], version);
}

/** Resolve `catalog.<name>` to npm "latest" from the active state's
 *  prefetched `getLatestVersion` accessor (the caller pre-resolves; no
 *  network here), creating the key if absent. No-op when no latest is
 *  available — default refresh passes no lookup, and a name that was not
 *  prefetched resolves to `undefined`; in both cases any existing entry is
 *  left untouched. This is the SDK-family resolver: on
 *  `refresh --update-deps-only` it both SEEDS a missing standard SDK key
 *  and refreshes a present one, and on `init` it overwrites the
 *  placeholder with the real latest. */
export function ensureCatalogLatest(name: string): void {
  const state = requireYaml("ensureCatalogLatest");
  if (!state.getLatestVersion) return;
  const latest = state.getLatestVersion(name);
  if (latest === undefined) return;
  if (readCatalogString(state, name) === latest) return;
  state.doc.setIn(["catalog", name], latest);
}

/** Remove `catalog.<name>` if present; no-op when absent. */
export function ensureCatalogAbsent(name: string): void {
  const state = requireYaml("ensureCatalogAbsent");
  if (!state.doc.hasIn(["catalog", name])) return;
  state.doc.deleteIn(["catalog", name]);
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
