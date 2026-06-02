// Test helpers for the engine.
//
// `runRulesAgainst`: unit helper — install `input` as the active
// managed-body object, invoke the body lambda, return the mutated object.
//
// `simulateInit`: produce an in-memory FS populated as if `block-tools
// structure init` had just run for the given BlockVars, then RE-DISCOVER
// the module set from that written FS (the same DISCOVERY the real `check`
// runs) rather than reusing init's module set. The returned `ctx` is the
// rediscovered one — running `engine.run(STRUCTURE, fs, {...ctx, dryRun:
// true})` against the same fs and asserting no changes is then a genuine
// init→check round-trip: a discovery / classification regression surfaces
// instead of being masked.

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BlockVars, Module, RunContext, Structure } from "./api";
import type { JsonObject } from "./content-rules";
import { withManagedBody } from "./content-rules";
import { MemoryFileSystem } from "./fs/memory";
import { createRunContext, modulesForInit } from "./ctx";
import { NodeTemplateProvider, type TemplateProvider } from "./templates";
import { run as engineRun } from "./runner";
import { discoverRunContext } from "./discovery-fs";
import { STRUCTURE_VERSION } from "./version";

/** Layer-1 helper. */
export function runRulesAgainst(input: JsonObject, body: () => void): JsonObject {
  return withManagedBody(input, body);
}

export type SimulateInitInput = {
  vars: BlockVars;
  /** Override the discovered module set. Defaults to `defaultModulesFor`. */
  modules?: Module[];
  /** Override the structure under test (defaults to the canonical one). */
  structure?: Structure;
  /** Override the template provider (defaults to NodeTemplateProvider
   *  pointing at the bundled `templates/` directory). */
  templates?: TemplateProvider;
  /** SDK-internal flag. Default `false` (standalone block). */
  isSdkInternal?: boolean;
  /** Sync npm-latest lookup for the `onInitOrUpdate` catalog resolution.
   *  Absent → the SDK catalog keeps its seed versions (no bump), matching
   *  an offline scaffold; tests that assert init writes latest pass a mock. */
  registryLookup?: (packageName: string) => string | undefined;
};

export type SimulatedInit = {
  fs: MemoryFileSystem;
  ctx: RunContext;
};

/** Module set produced by `init` for a given BlockVars. Delegates to the
 *  shared `modulesForInit` so the test helper and the real `init`
 *  constructor never drift. */
export function defaultModulesFor(vars: BlockVars): Module[] {
  return modulesForInit(vars);
}

let cachedDefaultStructure: Structure | undefined;
async function defaultStructure(): Promise<Structure> {
  if (cachedDefaultStructure) return cachedDefaultStructure;
  const mod = await import("../structure-definition");
  cachedDefaultStructure = mod.STRUCTURE;
  return cachedDefaultStructure;
}

/** Default template provider — reads from the bundled templates tree
 *  next to this file. */
export function defaultTemplateProvider(): TemplateProvider {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // engine/testing.ts → ../templates
  const root = path.resolve(here, "..", "templates");
  return new NodeTemplateProvider(root);
}

export async function simulateInit(input: SimulateInitInput): Promise<SimulatedInit> {
  const fs = new MemoryFileSystem();
  const isSdkInternal = input.isSdkInternal ?? false;
  const modules = input.modules ?? defaultModulesFor(input.vars);
  const initCtx = createRunContext({
    blockVars: input.vars,
    modules,
    isSdkInternal,
    version: STRUCTURE_VERSION,
  });
  const structure = input.structure ?? (await defaultStructure());
  const templates = input.templates ?? defaultTemplateProvider();
  await engineRun(structure, fs, initCtx, {
    templates,
    initMode: true,
    registryLookup: input.registryLookup,
  });

  // Re-discover from the written FS — the returned ctx is what `check`
  // would build, not what `init` assembled.
  const ctx = await discoverRunContext({ fs, isSdkInternal });
  return { fs, ctx };
}
