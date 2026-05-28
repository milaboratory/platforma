// Engine runner — structural pass, managed pass, post-run recheck.
//
// `run(structure, fs, ctx, opts)` drives one block through phases 3-7 of
// the spec lifecycle (DISCOVERY happens in the caller, which constructs
// `ctx.modules`). The function is shared by `check`, `refresh`, and
// `refresh --update-deps-only`:
//   - dryRun=true                            → check (no writes)
//   - dryRun=false, updateDepsOnly=false     → refresh default
//                                              (writes + .structure
//                                              bump + post-run recheck)
//   - dryRun=false, updateDepsOnly=true      → refresh --update-deps-only
//                                              (only onUpdateDeps leaves
//                                              fire; no version bump;
//                                              no recheck)
//
// Idempotency invariant is enforced by phase 7: after a successful
// refresh, the runner reruns the lifecycle in dry-run mode (fresh
// rediscover when supplied) and throws `RecheckError` on any non-empty
// change list. The error carries the failing item's
// (scope, path, primitive, action) tuple for diagnostics.

import { stringify as yamlStringify } from "yaml";
import type { ContentForm, FlatItem, Structure, TriggerContext } from "./ir";
import type { RunContext, Scope } from "./api";
import type { FileSystem } from "./fs/api";
import { flatten } from "./flatten";
import { withRunContext } from "./builders";
import { withManagedBody } from "./content-rules";
import { parseJson, stringifyJson } from "./parsers/json";
import type { JsonObject } from "./parsers/json";
import { writeStructureVersion, STRUCTURE_META_FILE } from "./version";

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
  rediscover?: (fs: FileSystem) => Promise<RunContext>;
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
 *  path. `file` / `tpl` resolution is deferred to step 4 (template tree
 *  not wired yet); `text` and `generate` are end-to-end here. */
function resolveContent(form: ContentForm, filePath: string): string {
  switch (form.kind) {
    case "text":
      return form.value;
    case "generate": {
      const value = form.fn();
      if (filePath.endsWith(".json")) {
        return stringifyJson(value);
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
    case "file":
      throw new Error(`file('${form.path}') content form: template tree not wired in step 2`);
    case "tpl":
      throw new Error(`tpl('${form.path}') content form: template tree not wired in step 2`);
  }
}

async function buildSnapshot(fs: FileSystem): Promise<Set<string>> {
  const files = await fs.list("");
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

function buildTriggerCtx(snap: Set<string>, ctx: RunContext): TriggerContext {
  return {
    ctx,
    version: ctx.version,
    pathExists: (p: string) => snapshotHas(snap, p),
    pathMissing: (p: string) => !snapshotHas(snap, p),
  };
}

function passesTriggers(item: FlatItem, tctx: TriggerContext): boolean {
  for (const t of item.triggers) {
    if (!t(tctx)) return false;
  }
  return true;
}

function filterByMode(items: FlatItem[], updateDepsOnly: boolean): FlatItem[] {
  return items.filter((i) => i.updateDepsOnly === updateDepsOnly);
}

async function applyStructural(
  item: FlatItem,
  fs: FileSystem,
  dryRun: boolean,
): Promise<Change | undefined> {
  const leaf = item.leaf;
  if (leaf.kind === "fixed") {
    const desired = resolveContent(leaf.content, item.resolvedPath);
    const exists = await fs.exists(item.resolvedPath);
    if (!exists) {
      if (!dryRun) await fs.write(item.resolvedPath, desired);
      return {
        scope: item.scope,
        path: item.resolvedPath,
        primitive: "fixed",
        action: "create",
      };
    }
    const current = await fs.read(item.resolvedPath);
    if (current === desired) return undefined;
    if (!dryRun) await fs.write(item.resolvedPath, desired);
    return {
      scope: item.scope,
      path: item.resolvedPath,
      primitive: "fixed",
      action: "update",
    };
  }
  if (leaf.kind === "scaffold") {
    if (await fs.exists(item.resolvedPath)) return undefined;
    const initial = resolveContent(leaf.initial, item.resolvedPath);
    if (!dryRun) await fs.write(item.resolvedPath, initial);
    return {
      scope: item.scope,
      path: item.resolvedPath,
      primitive: "scaffold",
      action: "create",
    };
  }
  if (leaf.kind === "seed") {
    // Seeds are written by `init` only — structure runs never touch them.
    return undefined;
  }
  if (leaf.kind === "remove") {
    if (!(await fs.exists(item.resolvedPath))) return undefined;
    if (!dryRun) await fs.delete(item.resolvedPath);
    return {
      scope: item.scope,
      path: item.resolvedPath,
      primitive: "remove",
      action: "delete",
    };
  }
  if (leaf.kind === "rename") {
    if (!(await fs.exists(item.resolvedPath))) return undefined;
    const to = item.resolvedTo!;
    if (await fs.exists(to)) {
      // dest exists — treat as already-renamed; no change.
      return undefined;
    }
    if (!dryRun) await fs.move(item.resolvedPath, to);
    return {
      scope: item.scope,
      path: item.resolvedPath,
      primitive: "rename",
      action: "rename",
    };
  }
  return undefined;
}

async function applyManaged(
  item: FlatItem,
  fs: FileSystem,
  dryRun: boolean,
): Promise<Change | undefined> {
  if (item.leaf.kind !== "managed") return undefined;
  const leaf = item.leaf;
  const path = item.resolvedPath;
  const exists = await fs.exists(path);

  let parsed: JsonObject;
  let beforeRaw: string;
  let created = false;

  if (!exists) {
    beforeRaw = resolveContent(leaf.initial, path);
    created = true;
  } else {
    beforeRaw = await fs.read(path);
  }

  // Parse, run body, serialise.
  try {
    parsed = parseJson(beforeRaw) as JsonObject;
  } catch (err) {
    throw new Error(`managed: failed to parse JSON at '${path}': ${(err as Error).message}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`managed: parsed value at '${path}' is not a JSON object`);
  }

  withManagedBody(parsed, leaf.body);
  const after = stringifyJson(parsed);

  if (created) {
    if (!dryRun) await fs.write(path, after);
    return {
      scope: item.scope,
      path,
      primitive: "managed",
      action: "create",
    };
  }
  if (after === beforeRaw) return undefined;
  if (!dryRun) await fs.write(path, after);
  return {
    scope: item.scope,
    path,
    primitive: "managed",
    action: "update",
  };
}

/** Execute one pass over the flattened items: structural items first
 *  (declaration order), then managed items. Returns the change list. */
async function executePass(
  flat: FlatItem[],
  fs: FileSystem,
  ctx: RunContext,
  dryRun: boolean,
): Promise<Change[]> {
  const items = filterByMode(flat, ctx.updateDepsOnly);
  const changes: Change[] = [];

  // Structural pass.
  const snap1 = await buildSnapshot(fs);
  const tctx1 = buildTriggerCtx(snap1, ctx);
  for (const item of items) {
    if (item.leaf.kind === "managed") continue;
    if (!passesTriggers(item, tctx1)) continue;
    const change = await applyStructural(item, fs, dryRun);
    if (change) changes.push(change);
  }

  // Re-snapshot after structural pass — managed-body triggers see the
  // post-rename / post-delete world.
  const snap2 = await buildSnapshot(fs);
  const tctx2 = buildTriggerCtx(snap2, ctx);
  for (const item of items) {
    if (item.leaf.kind !== "managed") continue;
    if (!passesTriggers(item, tctx2)) continue;
    const change = await applyManaged(item, fs, dryRun);
    if (change) changes.push(change);
  }

  return changes;
}

/**
 * Run the structurer engine end-to-end. See module header for mode
 * semantics. Throws `RecheckError` if the post-run dry-run finds any
 * leftover diff after a successful refresh.
 */
export async function run(
  structure: Structure,
  fs: FileSystem,
  ctx: RunContext,
  opts: RunOptions = {},
): Promise<RunResult> {
  return withRunContext(ctx, async () => {
    const flat = flatten(structure, ctx);
    const changes = await executePass(flat, fs, ctx, ctx.dryRun);

    const isRefreshDefault = !ctx.dryRun && !ctx.updateDepsOnly;

    if (isRefreshDefault) {
      // Phase 6: version bump.
      await writeStructureVersion(fs);

      // Phase 7: post-run recheck. Fresh discovery → fresh flatten →
      // dry-run. Any change list emits RecheckError on the first item.
      const recheckCtxBase = opts.rediscover ? await opts.rediscover(fs) : ctx;
      const recheckCtx: RunContext = { ...recheckCtxBase, dryRun: true };
      const recheckFlat = flatten(structure, recheckCtx);
      const recheckChanges = await executePass(recheckFlat, fs, recheckCtx, true);
      // Ignore .structure-meta self-write (already up to date after
      // writeStructureVersion above).
      const filtered = recheckChanges.filter((c) => c.path !== STRUCTURE_META_FILE);
      if (filtered.length > 0) {
        throw new RecheckError(filtered[0]!);
      }
    }

    return { changes };
  });
}
