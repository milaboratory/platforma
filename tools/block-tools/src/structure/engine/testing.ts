// Test helpers for the engine.
//
// `runRulesAgainst`: Layer-1 unit helper — install `input` as the active
// managed-body object, invoke the body lambda, return the mutated object.
// (testing-strategy.md § "Layer 1")
//
// `simulateInit`: Layer-2 helper — produce an in-memory FS populated as
// if `block-tools structure init` had just run for the given BlockVars.
// The Layer-2 zero-diff invariant then runs `engine.run(STRUCTURE, fs,
// {...ctx, dryRun: true})` against the same fs and asserts no changes.

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BlockVars, Module, RunContext, Structure } from "./api";
import type { JsonObject } from "./content-rules";
import { withManagedBody } from "./content-rules";
import { MemoryFileSystem } from "./fs/memory";
import { createRunContext } from "./ctx";
import { NodeTemplateProvider, type TemplateProvider } from "./templates";
import { run as engineRun } from "./runner";
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
};

export type SimulatedInit = {
  fs: MemoryFileSystem;
  ctx: RunContext;
};

/** Module set produced by `init` for a given BlockVars. One module per
 *  base scope plus one software module per selected platform. */
export function defaultModulesFor(vars: BlockVars): Module[] {
  const facade = vars.facadeName;
  const mods: Module[] = [
    { scope: "root", name: facade, path: "" },
    { scope: "block", name: `${facade}.block`, path: "block" },
    { scope: "model", name: `${facade}.model`, path: "model" },
    { scope: "ui", name: `${facade}.ui`, path: "ui" },
    { scope: "workflow", name: `${facade}.workflow`, path: "workflow" },
    { scope: "test", name: `${facade}.test`, path: "test" },
  ];
  if (vars.softwarePlatform) {
    const slug = vars.softwarePlatform.toLowerCase();
    mods.push({
      scope: "software",
      name: `${facade}.software-${slug}`,
      path: `software-${slug}`,
    });
  }
  return mods;
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
  const modules = input.modules ?? defaultModulesFor(input.vars);
  const ctx = createRunContext({
    blockVars: input.vars,
    modules,
    isSdkInternal: input.isSdkInternal ?? false,
    version: STRUCTURE_VERSION,
  });
  const structure = input.structure ?? (await defaultStructure());
  const templates = input.templates ?? defaultTemplateProvider();
  await engineRun(structure, fs, ctx, { templates, initMode: true });
  return { fs, ctx };
}
