// Filesystem-backed DISCOVERY.
//
// The engine runner consumes a fully-assembled `RunContext` (modules,
// version, blockVars). This module is the "caller" that builds it from a
// block directory, working through the engine's `FileSystem` abstraction
// — so the same code path serves the CLI (NodeFileSystem) and the
// in-memory init→check round-trip (MemoryFileSystem), which re-discovers
// from the just-written FS instead of reusing init's module set, so a
// discovery/classification regression surfaces in the parity invariant.
//
// Two enumeration modes:
//
//   - Standalone (default): read the block-root `pnpm-workspace.yaml`,
//     read each `packages:` member's `package.json` (literal paths only —
//     globs are a hard error), classify via `discoverModules`. This is the
//     canonical path.
//
//   - SDK-internal (`--sdk-internal`): in-monorepo blocks (e.g.
//     `etc/blocks/*`) have NO block-local `pnpm-workspace.yaml` — they
//     are members of the parent monorepo's workspace. The block's
//     modules are therefore enumerated by scanning the block directory
//     for sub-package `package.json` files (depth-limited, skipping
//     `node_modules`).
//
// `.structure` version is read (missing → 0) and floor-checked. BlockVars
// are parsed from the block-scope module's `package.json` `name` (the
// facade name), or — for the root-as-block shape — from the root package.

import { parse as parseYamlText } from "yaml";
import type { BlockVars, Module, RunContext } from "./api";
import type { FileSystem } from "./fs/api";
import { discoverModules, type WorkspacePackage, type PackageJsonLike } from "./discovery";
import { createRunContext } from "./ctx";
import { STRUCTURE_META_FILE, STRUCTURE_MIN_SUPPORTED, assertVersionAboveFloor } from "./version";

export class StructureCliError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "StructureCliError";
  }
}

/** Join two block-relative path segments ("" = root). */
function joinRel(a: string, b: string): string {
  return a === "" ? b : `${a}/${b}`;
}

function readJsonIfExists(fs: FileSystem, rel: string): PackageJsonLike | undefined {
  try {
    return JSON.parse(fs.read(rel)) as PackageJsonLike;
  } catch {
    return undefined;
  }
}

/** Resolve a single pnpm-workspace `packages:` entry to a block-relative
 *  directory path. Entries are literal paths only — the structurer does
 *  not expand globs: no real block uses them, and a globbing surface
 *  with no caller is dead complexity. A `*` anywhere is a hard error. */
function resolvePackagePath(pattern: string): string {
  if (pattern.includes("*")) {
    throw new StructureCliError(
      `pnpm-workspace.yaml 'packages:' entry '${pattern}' contains a glob. ` +
        `The structurer requires literal package paths — replace the glob ` +
        `with one entry per package directory.`,
    );
  }
  const p = pattern.replace(/^\.\//, "").replace(/\/$/, "");
  return p === "." ? "" : p;
}

function enumerateStandalone(fs: FileSystem): WorkspacePackage[] {
  let wsRaw: string;
  try {
    wsRaw = fs.read("pnpm-workspace.yaml");
  } catch {
    throw new StructureCliError(
      `No pnpm-workspace.yaml found. This directory is empty or ` +
        `unrecognisable as a block — run 'block-tools structure init' instead, ` +
        `or pass --sdk-internal for an in-monorepo block.`,
    );
  }
  const ws = (parseYamlText(wsRaw) ?? {}) as { packages?: string[] };
  const patterns = Array.isArray(ws.packages) ? ws.packages : [];
  // The block root ("") is ALWAYS a member, discovered implicitly.
  // pnpm treats the directory holding pnpm-workspace.yaml as the implicit
  // workspace root, so the structurer reads the root package.json directly
  // — no real block lists "." in `packages:` (it would break turbo's task
  // graph), and the structurer never requires or writes it. The Set
  // dedupes if a workspace did list ".".
  const dirs = new Set<string>([""]);
  for (const pat of patterns) {
    const d = resolvePackagePath(pat);
    if (d === "" || fs.exists(d)) dirs.add(d);
  }
  const out: WorkspacePackage[] = [];
  for (const d of dirs) {
    const pkg = readJsonIfExists(fs, joinRel(d, "package.json"));
    if (pkg) out.push({ path: d, pkg });
  }
  return out;
}

/** SDK-internal enumeration: scan the block directory for sub-package
 *  `package.json` files. Depth-limited to two levels (covers `block/`,
 *  `model/`, … and `software/<name>/`), skipping `node_modules`. */
function enumerateSdkInternal(fs: FileSystem): WorkspacePackage[] {
  const out: WorkspacePackage[] = [];
  const SKIP = new Set(["node_modules", ".turbo", "dist", ".git", "block-pack"]);

  function scan(rel: string, depth: number): void {
    const entries = fs.listDir(rel);
    for (const e of entries) {
      if (!e.isDirectory || SKIP.has(e.name)) continue;
      const childRel = joinRel(rel, e.name);
      const pkg = readJsonIfExists(fs, joinRel(childRel, "package.json"));
      if (pkg) out.push({ path: childRel, pkg });
      if (depth < 2) scan(childRel, depth + 1);
    }
  }
  scan("", 1);
  return out;
}

/** Parse a facade package name `@npmOrg/orgScope.shortName` into BlockVars. */
export function parseBlockVars(facadeName: string): BlockVars {
  const slash = facadeName.indexOf("/");
  if (!facadeName.startsWith("@") || slash < 0) {
    throw new StructureCliError(
      `Cannot parse block name '${facadeName}': expected '@npm-org/org-scope.short-name'.`,
    );
  }
  const npmOrg = facadeName.slice(0, slash);
  const baseName = facadeName.slice(slash + 1);
  const dot = baseName.indexOf(".");
  if (dot < 0) {
    throw new StructureCliError(
      `Cannot parse block name '${facadeName}': base name '${baseName}' has no '.' separating org-scope from short-name.`,
    );
  }
  return {
    facadeName,
    baseName,
    npmOrg,
    orgScope: baseName.slice(0, dot),
    shortName: baseName.slice(dot + 1),
  };
}

function readVersion(fs: FileSystem): number {
  try {
    const parsed = JSON.parse(fs.read(STRUCTURE_META_FILE)) as { version?: number };
    return typeof parsed.version === "number" ? parsed.version : 0;
  } catch {
    return 0;
  }
}

export type DiscoverInput = {
  /** Block-rooted filesystem (NodeFileSystem for the CLI, MemoryFileSystem
   *  for the Layer-2 round-trip). */
  fs: FileSystem;
  isSdkInternal: boolean;
  updateDepsOnly?: boolean;
  dryRun?: boolean;
};

/**
 * Run DISCOVERY against a block filesystem and return a fully-assembled
 * `RunContext`, ready for `engine.run`. Throws `StructureCliError` /
 * `DiscoveryError` / `StructureVersionFloorError` on a non-block dir,
 * an unclassified package, or a below-floor version.
 */
export function discoverRunContext(input: DiscoverInput): RunContext {
  const { fs, isSdkInternal } = input;

  const packages = isSdkInternal ? enumerateSdkInternal(fs) : enumerateStandalone(fs);

  if (packages.length === 0) {
    throw new StructureCliError(
      `No workspace packages found. ` + `Run 'block-tools structure init' to scaffold a block.`,
    );
  }

  const modules: Module[] = discoverModules(packages);

  const version = readVersion(fs);
  assertVersionAboveFloor(version, STRUCTURE_MIN_SUPPORTED);

  // BlockVars from the block-scope module's name (facade). Fall back to
  // the root module if a block has the root-as-block shape.
  const blockMod =
    modules.find((m) => m.scope === "block") ?? modules.find((m) => m.scope === "root");
  if (!blockMod) {
    throw new StructureCliError(
      `Could not find a 'block' (or root-as-block) package to derive BlockVars from.`,
    );
  }
  // This structurer names the block package `<facade>.block`
  // (block-package-json.ts). The root package carries no `name`, so DISCOVERY
  // derives BlockVars from the block module — whose `.block` suffix would
  // otherwise leak into `shortName` on refresh/check (but not init, which is
  // fed the facade directly). Strip it so `shortName` is the real short name
  // everywhere. No-op for legacy blocks whose block package IS the bare facade
  // and for the root-as-block fallback.
  const facadeName = blockMod.name.replace(/\.block$/, "");
  const blockVars = parseBlockVars(facadeName);

  return createRunContext({
    isSdkInternal,
    updateDepsOnly: input.updateDepsOnly ?? false,
    modules,
    blockVars,
    version,
    dryRun: input.dryRun ?? false,
  });
}
