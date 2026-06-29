// Engine runner — structural pass, managed pass, post-run recheck.
//
// `run(structure, fs, ctx, opts)` drives one block through the structural
// pass, managed pass, and post-run recheck (DISCOVERY happens in the
// caller, which constructs `ctx.modules`). The function is shared by
// `check`, `refresh`,
// `refresh --update-deps-only`, and `init`. The mode (see `currentMode`)
// selects which leaves fire — a leaf fires iff its `modes` include the
// current one:
//   - dryRun=true                            → check, mode "default" (no
//                                              writes)
//   - dryRun=false, updateDepsOnly=false     → refresh, mode "default"
//                                              (writes + .structure bump +
//                                              post-run recheck)
//   - dryRun=false, updateDepsOnly=true      → refresh --update-deps-only,
//                                              mode "updateDeps" (only
//                                              onUpdateDeps/onInitOrUpdate
//                                              leaves fire; no version
//                                              bump; no recheck)
//   - dryRun=false, opts.initMode=true       → init, mode "init" (default
//                                              + onInitOrUpdate leaves +
//                                              seeds; no recheck — the
//                                              init→check test runs an
//                                              explicit dry-run afterwards)
//
// Idempotency invariant is enforced by the post-run recheck: after a
// successful refresh, the runner reruns the lifecycle in dry-run mode (fresh
// rediscover when supplied) and throws `RecheckError` on any non-empty
// change list. The error carries the failing item's
// (scope, path, primitive, action) tuple for diagnostics.

import { stringify as yamlStringify } from "yaml";
import type { ContentForm, FlatItem, RunMode, Structure, TriggerContext, ManagedBody } from "./ir";
import type { RunContext, Scope } from "./api";
import type { FileSystem } from "./fs/api";
import type { TemplateProvider } from "./templates";
import { substituteVars } from "./templates";
import { flatten } from "./flatten";
import { matchesGlob } from "./glob";
import { withRunContext } from "./builders";
import {
  withManagedBody,
  withManagedYaml,
  withManagedLines,
  resolveSdkSentinelsInJson,
} from "./content-rules";
import { parseJson, stringifyJson } from "./parsers/json";
import type { JsonObject } from "./parsers/json";
import { parseYaml, stringifyYaml } from "./parsers/yaml";
import { parseLines, serializeLines } from "./parsers/lines";
import { writeStructureMeta, STRUCTURE_VERSION, STRUCTURE_META_FILE } from "./version";

export type ChangeAction = "create" | "update" | "delete" | "rename" | "noop";

export type Change = {
  scope: Scope;
  /** Resolved (block-relative) path. For rename, the source path. */
  path: string;
  /** "fixed" | "managed" | "scaffold" | "seed" | "remove" | "rename" */
  primitive: string;
  action: ChangeAction;
};

export type RunResult = {
  changes: Change[];
};

export type RunOptions = {
  /** Called before the post-run recheck to obtain a fresh RunContext
   *  reflecting the just-written FS state (re-reads `pnpm-workspace.yaml`).
   *  If absent, recheck reuses the original ctx with `dryRun: true`. */
  rediscover?: (fs: FileSystem) => RunContext;
  /** Template provider used by `file(...)` and `tpl(...)` content forms.
   *  Required whenever the structure references such forms. */
  templates?: TemplateProvider;
  /** Init mode: write seed leaves (only-if-missing semantics) and skip
   *  the post-run recheck. The caller is expected to follow with an
   *  explicit dry-run check (Layer-2 invariant). */
  initMode?: boolean;
  /** Sync accessor for prefetched npm "latest" versions, consumed by
   *  `ensureCatalogLatest` inside `onUpdateDeps` managed bodies. The CLI
   *  prefetches the catalog's package versions before the run (network)
   *  and passes the resulting sync map here; unit tests pass a mock.
   *  Absent → `ensureCatalogLatest` is a no-op (default refresh). */
  registryLookup?: (packageName: string) => string | undefined;
  /** Sync accessor for prefetched derived catalog pins
   *  (`catalogEntry → exact version`), consumed by `pinCatalogToDependencyOf`
   *  inside `onInitOrUpdate` managed bodies. The CLI / init constructor
   *  prefetches + validates these before the run (network). Absent →
   *  `pinCatalogToDependencyOf` is a no-op (default refresh). */
  derivedPinLookup?: (catalogEntry: string) => string | undefined;
};

export class RecheckError extends Error {
  constructor(public readonly failing: Change) {
    super(
      `Post-run recheck: rule set not idempotent. ` +
        `Failing item: ${failing.primitive} '${failing.path}' ` +
        `(scope=${failing.scope}, action=${failing.action}). Engine bug.`,
    );
    this.name = "RecheckError";
  }
}

/** Resolve a `ContentForm` to its on-disk string for the given file
 *  path. `file` / `tpl` resolution goes through the configured
 *  `TemplateProvider`; `generate` returns parsed structure → JSON/YAML
 *  or a string. */
function resolveContent(
  form: ContentForm,
  filePath: string,
  templates: TemplateProvider | undefined,
  ctx: RunContext,
): string {
  switch (form.kind) {
    case "text":
      return form.value;
    case "file": {
      if (!templates) {
        throw new Error(
          `file('${form.path}'): no TemplateProvider configured. ` +
            `Pass opts.templates to engine.run(...).`,
        );
      }
      return templates.staticRead(form.path);
    }
    case "tpl": {
      if (!templates) {
        throw new Error(
          `tpl('${form.path}'): no TemplateProvider configured. ` +
            `Pass opts.templates to engine.run(...).`,
        );
      }
      const raw = templates.textRead(form.path);
      const vars = typeof form.vars === "function" ? form.vars(ctx) : form.vars;
      return substituteVars(raw, vars);
    }
    case "generate": {
      const value = form.fn(ctx);
      if (filePath.endsWith(".json")) {
        // Resolve `sdk:` sentinels in the generated dep sections so the
        // initial content matches what the body rules re-assert.
        resolveSdkSentinelsInJson(value, ctx.isSdkInternal);
        // package.json stays fully expanded (oxfmt's package.json shape);
        // every other .json collapses to oxfmt's generic-file shape.
        return stringifyJson(value, { collapse: !filePath.endsWith("package.json") });
      }
      if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
        return yamlStringify(value);
      }
      if (typeof value !== "string") {
        throw new Error(
          `generate() for '${filePath}' must return a string for non-JSON/YAML files; got ${typeof value}`,
        );
      }
      return value;
    }
    case "binary":
      throw new Error(
        `binary('${form.path}') cannot be resolved to a string; it is only valid ` +
          `inside seed()/scaffold(), which copy it verbatim via fs.writeBinary.`,
      );
  }
}

/** Write a leaf's content to disk, dispatching binary assets (copied
 *  verbatim, never utf-8 decoded) from string content. */
function writeLeafContent(
  fs: FileSystem,
  resolvedPath: string,
  form: ContentForm,
  templates: TemplateProvider | undefined,
  ctx: RunContext,
): void {
  if (form.kind === "binary") {
    if (!templates) {
      throw new Error(
        `binary('${form.path}'): no TemplateProvider configured. ` +
          `Pass opts.templates to engine.run(...).`,
      );
    }
    fs.writeBinary(resolvedPath, templates.staticReadBinary(form.path));
    return;
  }
  fs.write(resolvedPath, resolveContent(form, resolvedPath, templates, ctx));
}

/** Dispatch managed-body parse → mutate → serialize by file extension /
 *  basename. JSON, YAML, and lines all share the same `(initial, body,
 *  triggerContext) → newRaw` shape via the active-state wrappers in
 *  `content-rules.ts`. */
function runManagedBody(
  path: string,
  raw: string,
  body: ManagedBody,
  tctx: TriggerContext,
  registryLookup: ((packageName: string) => string | undefined) | undefined,
  derivedPinLookup: ((catalogEntry: string) => string | undefined) | undefined,
): string {
  const base = path.split("/").pop() ?? path;
  if (path.endsWith(".json")) {
    const parsed = parseJson(raw) as JsonObject;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`managed: parsed value at '${path}' is not a JSON object`);
    }
    withManagedBody(parsed, body, { triggerContext: tctx });
    // package.json stays fully expanded; other .json (tsconfig, …) collapses
    // to oxfmt's generic-file shape.
    return stringifyJson(parsed, { collapse: base !== "package.json" });
  }
  if (path.endsWith(".yaml") || path.endsWith(".yml")) {
    const doc = parseYaml(raw);
    withManagedYaml(doc, body, {
      triggerContext: tctx,
      getLatestVersion: registryLookup,
      getDerivedDependencyPin: derivedPinLookup,
    });
    return stringifyYaml(doc);
  }
  if (base === ".gitignore" || base.endsWith(".gitignore")) {
    const lines = parseLines(raw);
    withManagedLines(lines, body, { triggerContext: tctx });
    return serializeLines(lines);
  }
  throw new Error(
    `managed('${path}'): unsupported file kind. Only .json, .yaml, .yml, .gitignore are dispatched.`,
  );
}

function buildSnapshot(fs: FileSystem): Set<string> {
  const files = fs.list("");
  const out = new Set<string>();
  for (const f of files) {
    out.add(f);
    const parts = f.split("/");
    for (let i = 1; i < parts.length; i++) {
      out.add(parts.slice(0, i).join("/"));
    }
  }
  return out;
}

function snapshotHas(snap: Set<string>, p: string): boolean {
  const n = p === "" ? p : p.endsWith("/") ? p.slice(0, -1) : p;
  return snap.has(n);
}

/** Build the trigger context for one leaf. `pathExists`/`pathMissing` are
 *  block-relative; `filesMatch` resolves its glob MODULE-RELATIVE to
 *  `modulePath` so the same predicate (`whenFilesExist("src/*.test.ts")`)
 *  reads the right module when a scope fans out. The snapshot is shared
 *  across leaves; only the resolution prefix differs per item. */
function buildTriggerCtx(snap: Set<string>, ctx: RunContext, modulePath: string): TriggerContext {
  return {
    ctx,
    version: ctx.version,
    pathExists: (p: string) => snapshotHas(snap, p),
    pathMissing: (p: string) => !snapshotHas(snap, p),
    filesMatch: (glob: string) => {
      const resolved = modulePath ? `${modulePath}/${glob}` : glob;
      for (const entry of snap) {
        if (matchesGlob(resolved, entry)) return true;
      }
      return false;
    },
  };
}

function passesTriggers(item: FlatItem, tctx: TriggerContext): boolean {
  for (const t of item.triggers) {
    if (!t(tctx)) return false;
  }
  return true;
}

/** Derive the active run mode from the context + init flag. `check`
 *  (dryRun) and `refresh` share `"default"` — same leaves, the `dryRun`
 *  flag alone decides whether writes land. */
function currentMode(ctx: RunContext, initMode: boolean): RunMode {
  if (initMode) return "init";
  if (ctx.updateDepsOnly) return "updateDeps";
  return "default";
}

function filterByMode(items: FlatItem[], mode: RunMode): FlatItem[] {
  return items.filter((i) => i.modes.includes(mode));
}

function applyStructural(
  item: FlatItem,
  fs: FileSystem,
  dryRun: boolean,
  templates: TemplateProvider | undefined,
  initMode: boolean,
  ctx: RunContext,
): Change | undefined {
  const leaf = item.leaf;
  if (leaf.kind === "fixed") {
    const desired = resolveContent(leaf.content, item.resolvedPath, templates, ctx);
    const exists = fs.exists(item.resolvedPath);
    if (!exists) {
      if (!dryRun) fs.write(item.resolvedPath, desired);
      return {
        scope: item.scope,
        path: item.resolvedPath,
        primitive: "fixed",
        action: "create",
      };
    }
    const current = fs.read(item.resolvedPath);
    if (current === desired) return undefined;
    if (!dryRun) fs.write(item.resolvedPath, desired);
    return {
      scope: item.scope,
      path: item.resolvedPath,
      primitive: "fixed",
      action: "update",
    };
  }
  if (leaf.kind === "scaffold") {
    if (fs.exists(item.resolvedPath)) return undefined;
    if (!dryRun) {
      writeLeafContent(fs, item.resolvedPath, leaf.initial, templates, ctx);
    }
    return {
      scope: item.scope,
      path: item.resolvedPath,
      primitive: "scaffold",
      action: "create",
    };
  }
  if (leaf.kind === "seed") {
    // Init mode: write seeds once if missing (same shape as scaffold).
    // Refresh / check: seeds are off-limits to the engine — they belong
    // to the block author. Layer-2 init→check parity relies on the
    // init action depositing canonical seed content, then the check
    // pass simply skipping seeds (vacuously fine).
    if (!initMode) return undefined;
    if (fs.exists(item.resolvedPath)) return undefined;
    if (!dryRun) {
      writeLeafContent(fs, item.resolvedPath, leaf.initial, templates, ctx);
    }
    return {
      scope: item.scope,
      path: item.resolvedPath,
      primitive: "seed",
      action: "create",
    };
  }
  if (leaf.kind === "remove") {
    if (!fs.exists(item.resolvedPath)) return undefined;
    if (!dryRun) fs.delete(item.resolvedPath);
    return {
      scope: item.scope,
      path: item.resolvedPath,
      primitive: "remove",
      action: "delete",
    };
  }
  if (leaf.kind === "rename") {
    if (!fs.exists(item.resolvedPath)) return undefined;
    const to = item.resolvedTo!;
    if (fs.exists(to)) {
      // dest exists — treat as already-renamed; no change.
      return undefined;
    }
    if (!dryRun) fs.move(item.resolvedPath, to);
    return {
      scope: item.scope,
      path: item.resolvedPath,
      primitive: "rename",
      action: "rename",
    };
  }
  return undefined;
}

function applyManaged(
  item: FlatItem,
  fs: FileSystem,
  dryRun: boolean,
  tctx: TriggerContext,
  templates: TemplateProvider | undefined,
  registryLookup: ((packageName: string) => string | undefined) | undefined,
  derivedPinLookup: ((catalogEntry: string) => string | undefined) | undefined,
  ctx: RunContext,
): Change | undefined {
  if (item.leaf.kind !== "managed") return undefined;
  const leaf = item.leaf;
  const path = item.resolvedPath;
  const exists = fs.exists(path);

  let beforeRaw: string;
  let created = false;

  if (!exists) {
    beforeRaw = resolveContent(leaf.initial, path, templates, ctx);
    created = true;
  } else {
    beforeRaw = fs.read(path);
  }

  const after = runManagedBody(path, beforeRaw, leaf.body, tctx, registryLookup, derivedPinLookup);

  if (created) {
    if (!dryRun) fs.write(path, after);
    return {
      scope: item.scope,
      path,
      primitive: "managed",
      action: "create",
    };
  }
  if (after === beforeRaw) return undefined;
  if (!dryRun) fs.write(path, after);
  return {
    scope: item.scope,
    path,
    primitive: "managed",
    action: "update",
  };
}

/** Execute one pass over the flattened items: structural items first
 *  (declaration order), then managed items. Returns the change list. */
function executePass(
  flat: FlatItem[],
  fs: FileSystem,
  ctx: RunContext,
  dryRun: boolean,
  templates: TemplateProvider | undefined,
  initMode: boolean,
  registryLookup: ((packageName: string) => string | undefined) | undefined,
  derivedPinLookup: ((catalogEntry: string) => string | undefined) | undefined,
): Change[] {
  const items = filterByMode(flat, currentMode(ctx, initMode));
  const changes: Change[] = [];

  // Structural pass. The trigger context is per-item: `filesMatch` resolves
  // module-relative, so it must carry the leaf's bound module path.
  const snap1 = buildSnapshot(fs);
  for (const item of items) {
    if (item.leaf.kind === "managed") continue;
    const tctx1 = buildTriggerCtx(snap1, ctx, item.modulePath);
    if (!passesTriggers(item, tctx1)) continue;
    const change = applyStructural(item, fs, dryRun, templates, initMode, ctx);
    if (change) changes.push(change);
  }

  // Re-snapshot after structural pass — managed-body triggers see the
  // post-rename / post-delete world.
  const snap2 = buildSnapshot(fs);
  for (const item of items) {
    if (item.leaf.kind !== "managed") continue;
    const tctx2 = buildTriggerCtx(snap2, ctx, item.modulePath);
    if (!passesTriggers(item, tctx2)) continue;
    const change = applyManaged(
      item,
      fs,
      dryRun,
      tctx2,
      templates,
      registryLookup,
      derivedPinLookup,
      ctx,
    );
    if (change) changes.push(change);
  }

  return changes;
}

/**
 * Run the structurer engine end-to-end. See module header for mode
 * semantics. Throws `RecheckError` if the post-run dry-run finds any
 * leftover diff after a successful refresh.
 */
export function run(
  structure: Structure,
  fs: FileSystem,
  ctx: RunContext,
  opts: RunOptions = {},
): RunResult {
  return withRunContext(ctx, () => {
    const flat = flatten(structure, ctx);
    const initMode = !!opts.initMode;
    const changes = executePass(
      flat,
      fs,
      ctx,
      ctx.dryRun,
      opts.templates,
      initMode,
      opts.registryLookup,
      opts.derivedPinLookup,
    );

    const isRefreshDefault = !ctx.dryRun && !ctx.updateDepsOnly && !initMode;

    if (isRefreshDefault) {
      // version bump + persist the software-build marker
      writeStructureMeta(fs, { version: STRUCTURE_VERSION, softwareBuild: ctx.softwareBuild });

      // post-run recheck. Fresh discovery → fresh flatten →
      // dry-run. Any change list emits RecheckError on the first item.
      const recheckCtxBase = opts.rediscover ? opts.rediscover(fs) : ctx;
      const recheckCtx: RunContext = { ...recheckCtxBase, dryRun: true };
      const recheckFlat = flatten(structure, recheckCtx);
      const recheckChanges = executePass(
        recheckFlat,
        fs,
        recheckCtx,
        true,
        opts.templates,
        false,
        opts.registryLookup,
        opts.derivedPinLookup,
      );
      // Ignore .structure self-write (already up to date after
      // writeStructureMeta above).
      const filtered = recheckChanges.filter((c) => c.path !== STRUCTURE_META_FILE);
      if (filtered.length > 0) {
        throw new RecheckError(filtered[0]!);
      }
    }

    // Init mode: write .structure so the resulting tree carries the
    // current version (matches what `init` ships to disk).
    if (initMode && !ctx.dryRun) {
      writeStructureMeta(fs, { version: STRUCTURE_VERSION, softwareBuild: ctx.softwareBuild });
    }

    return { changes };
  });
}
