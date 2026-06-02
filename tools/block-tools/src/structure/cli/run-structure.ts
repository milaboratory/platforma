// Shared driver for the `structure check` and `structure refresh`
// oclif commands. Wraps DISCOVERY (discover-fs) + the engine runner for
// one block path, handling the standalone vs `--sdk-internal` split, the
// `--update-deps-only` registry prefetch, and the post-run recheck's
// fresh re-discovery. Each block path is processed independently (spec.md
// § "Multi-block runs" — no cross-block state).

import path from "node:path";
import fsp from "node:fs/promises";
import { parse as parseYamlText } from "yaml";
import { NodeFileSystem } from "../engine/fs/node";
import { NodeTemplateProvider } from "../engine/templates";
import { run as engineRun, type Change } from "../engine/runner";
import { discoverRunContext } from "../engine/discovery-fs";
import { STRUCTURE } from "../structure-definition";
import { matchesBumpPattern, buildRegistryLookupForNames } from "../engine/registry-client";

export type StructureMode = "check" | "refresh";

export type RunStructureInput = {
  /** User-supplied block path (resolved against cwd). */
  blockPath: string;
  isSdkInternal: boolean;
  updateDepsOnly: boolean;
  mode: StructureMode;
  /** `<block-tools>/src/structure/templates` (from oclif `config.root`). */
  templatesRoot: string;
  log: (msg: string) => void;
};

export type RunStructureResult = {
  blockPath: string;
  changes: Change[];
};

/** Resolve the registry lookup for `--update-deps-only`: read the on-disk
 *  catalog, select the SDK families (bump patterns), prefetch their npm
 *  "latest" so the sync `bumpCatalogToLatest` builder can read it without
 *  doing I/O inside the managed body. A missing/unreadable workspace file
 *  yields an empty lookup; a network failure during prefetch propagates. */
async function buildRegistryLookup(root: string): Promise<(name: string) => string | undefined> {
  let catalogNames: string[] = [];
  try {
    const raw = await fsp.readFile(path.join(root, "pnpm-workspace.yaml"), "utf-8");
    const ws = (parseYamlText(raw) ?? {}) as { catalog?: Record<string, unknown> };
    catalogNames = Object.keys(ws.catalog ?? {}).filter(matchesBumpPattern);
  } catch {
    catalogNames = [];
  }
  return buildRegistryLookupForNames(catalogNames);
}

export async function runStructureForPath(input: RunStructureInput): Promise<RunStructureResult> {
  const root = path.resolve(input.blockPath);
  const dryRun = input.mode === "check";

  const fs = new NodeFileSystem(root);
  const templates = new NodeTemplateProvider(input.templatesRoot);

  const ctx = await discoverRunContext({
    fs,
    isSdkInternal: input.isSdkInternal,
    updateDepsOnly: input.updateDepsOnly,
    dryRun,
  });

  const registryLookup = input.updateDepsOnly ? await buildRegistryLookup(root) : undefined;

  const result = await engineRun(STRUCTURE, fs, ctx, {
    templates,
    registryLookup,
    // Fresh re-discovery for the post-run recheck (default refresh only)
    // — re-reads the just-written tree so a rename that shifted the
    // module map is observed (spec.md phase 7).
    rediscover: async () =>
      discoverRunContext({
        fs,
        isSdkInternal: input.isSdkInternal,
        updateDepsOnly: false,
        dryRun: true,
      }),
  });

  return { blockPath: input.blockPath, changes: result.changes };
}

/** One-line-per-change summary for CLI output. */
export function formatChanges(blockPath: string, changes: Change[]): string {
  if (changes.length === 0) return `  ${blockPath}: up to date (0 changes)`;
  const lines = changes.map(
    (c) => `    ${c.action.padEnd(6)} ${c.primitive.padEnd(8)} ${c.path} [${c.scope}]`,
  );
  return `  ${blockPath}: ${changes.length} change(s)\n${lines.join("\n")}`;
}
