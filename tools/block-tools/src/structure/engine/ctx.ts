// RunContext assembly helpers. The full `RunContext` type lives in
// `api.ts` (rule authors see it via `({ ctx }) => ...` trigger
// predicates). This file provides convenience constructors.

import type { BlockVars, Module, RunContext } from "./api";

/**
 * Module set produced by `init` for the given BlockVars: one module per
 * base scope (root/block/model/ui/workflow/test) plus, when a platform
 * was selected, one `software` module. `--platform` is single-valued, so
 * `init` produces at most one software module; multi-software shapes only
 * arise via DISCOVERY on existing blocks (spec.md § "Subcommands").
 *
 * Single source of truth shared by the real `init` constructor and the
 * Layer-2 `simulateInit` test helper — keeping them in lockstep is what
 * makes the init→check zero-diff invariant meaningful.
 */
export function modulesForInit(vars: BlockVars): Module[] {
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
    // Single software module lives at the flat `software/` dir with name
    // `${facade}.software` — matches the boilerplate and every real
    // single-software block (D6). Multi-software blocks arise only via
    // DISCOVERY on existing workspaces, never from `init`.
    mods.push({
      scope: "software",
      name: `${facade}.software`,
      path: "software",
    });
  }
  return mods;
}

export type CreateRunContextInput = {
  isSdkInternal?: boolean;
  updateDepsOnly?: boolean;
  modules: Module[];
  blockVars: BlockVars;
  version?: number;
  dryRun?: boolean;
};

export function createRunContext(input: CreateRunContextInput): RunContext {
  return {
    isSdkInternal: input.isSdkInternal ?? false,
    updateDepsOnly: input.updateDepsOnly ?? false,
    modules: input.modules,
    blockVars: input.blockVars,
    version: input.version ?? 0,
    dryRun: input.dryRun ?? false,
  };
}
