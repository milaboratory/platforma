// Shared driver for the `structure check` and `structure refresh`
// oclif commands. Wraps DISCOVERY (discover-fs) + the engine runner for
// one block path, handling the standalone vs `--sdk-internal` split, the
// `--update-deps-only` registry prefetch, and the post-run recheck's
// fresh re-discovery. Each block path is processed independently (no
// cross-block state).

import path from "node:path";
import { NodeFileSystem } from "../engine/fs/node";
import { NodeTemplateProvider } from "../engine/templates";
import { run as engineRun, type Change } from "../engine/runner";
import { discoverRunContext } from "../engine/discovery-fs";
import { STRUCTURE } from "../structure-definition";
import {
  matchesBumpPattern,
  buildRegistryLookupForNames,
  buildDerivedPinLookupForPins,
} from "../engine/registry-client";
import { SDK_CATALOG_PACKAGES, DERIVED_CATALOG_PINS } from "../rules/root-pnpm-workspace";

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

/** Resolve the registry lookup for `--update-deps-only`: prefetch npm
 *  "latest" for the SDK catalog MEMBERSHIP list (`SDK_CATALOG_PACKAGES`),
 *  not the on-disk catalog keys, so the sync `ensureCatalogLatest` builder
 *  can SEED a standard SDK key the block does not yet carry — reading
 *  the on-disk catalog could never resolve an absent key. Mirrors
 *  the `runInit` prefetch. A network failure during prefetch propagates. */
async function buildRegistryLookup(): Promise<(name: string) => string | undefined> {
  // Every SDK_CATALOG_PACKAGES entry matches a bump pattern (enforced at
  // load time in root-pnpm-workspace); filter defensively all the same.
  const names = SDK_CATALOG_PACKAGES.filter(matchesBumpPattern);
  return buildRegistryLookupForNames(names);
}

export async function runStructureForPath(input: RunStructureInput): Promise<RunStructureResult> {
  const root = path.resolve(input.blockPath);
  const dryRun = input.mode === "check";

  const fs = new NodeFileSystem(root);
  const templates = new NodeTemplateProvider(input.templatesRoot);

  const ctx = discoverRunContext({
    fs,
    isSdkInternal: input.isSdkInternal,
    updateDepsOnly: input.updateDepsOnly,
    dryRun,
  });

  const registryLookup = input.updateDepsOnly ? await buildRegistryLookup() : undefined;
  // Derived catalog pins (e.g. vue ← ui-vue's declared dep) resolve on the
  // same prefetch budget as the SDK latest bump; absent on a default refresh.
  const derivedPinLookup = input.updateDepsOnly
    ? await buildDerivedPinLookupForPins(DERIVED_CATALOG_PINS)
    : undefined;

  const result = engineRun(STRUCTURE, fs, ctx, {
    templates,
    registryLookup,
    derivedPinLookup,
    // Fresh re-discovery for the post-run recheck (default refresh only)
    // — re-reads the just-written tree so a rename that shifted the
    // module map is observed.
    rediscover: () =>
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
