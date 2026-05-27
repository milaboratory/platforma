// Test helpers for the engine.
//
// `runRulesAgainst`: feed a parsed-object input + a body lambda that
// calls content-rule builders; return the mutated object. Used by
// Layer-1 unit tests (testing-strategy.md § "Layer 1"). Step-1 stub
// — wired up properly in step 2 once `content-rules.ts` has real
// builders.
//
// `simulateInit`: populate an in-memory FS + RunContext from
// `BlockVars`, as if `block-tools structure init` had just run. Used
// by Layer-2 init→check parity tests (step 4).

import type { BlockVars, Module, RunContext } from "./api";
import type { JsonObject } from "./content-rules";
import { MemoryFileSystem } from "./fs/memory";
import { createRunContext } from "./ctx";

/** Step-1 stub: returns input unchanged. Body is invoked for shape
 *  testing only. Step 2 replaces the body context with the real
 *  content-builder bag. */
export function runRulesAgainst(input: JsonObject, body: () => void): JsonObject {
  body();
  return input;
}

export type SimulateInitInput = {
  vars: BlockVars;
  /** Override which modules are assembled. Defaults: one block-scope
   *  module at "" plus one each for model/ui/workflow/test, plus one
   *  software per `vars.softwarePlatforms` entry. */
  modules?: Module[];
};

export type SimulatedInit = {
  fs: MemoryFileSystem;
  ctx: RunContext;
};

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
  for (const platform of vars.softwarePlatforms ?? []) {
    const slug = platform.toLowerCase();
    mods.push({
      scope: "software",
      name: `${facade}.software-${slug}`,
      path: `software-${slug}`,
    });
  }
  return mods;
}

/** Step-1 stub: produces fs + ctx without writing files (step 4
 *  populates the FS with seeded layouts). Useful here for ctx
 *  assembly tests. */
export function simulateInit(input: SimulateInitInput): SimulatedInit {
  const fs = new MemoryFileSystem();
  const modules = input.modules ?? defaultModulesFor(input.vars);
  const ctx = createRunContext({
    blockVars: input.vars,
    modules,
  });
  return { fs, ctx };
}
