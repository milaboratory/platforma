// RunContext assembly helpers + module-lookup helpers. The full
// `RunContext` type lives in `api.ts` (rule authors see it via
// `({ ctx }) => ...` trigger predicates). This file provides convenience
// constructors and the scope-lookup helpers generators use.

import type { BlockVars, Module, RunContext, Scope } from "./api";

/** All modules of `scope` (zero or more). Never throws. Use when "zero or
 *  more" is the right intent (e.g. software). */
export function findModules(ctx: RunContext, scope: Scope): Module[] {
  return ctx.modules.filter((m) => m.scope === scope);
}

/** The single module of `scope`. Throws if absent OR if more than one
 *  exists. Use when exactly one is required (model / ui / workflow). */
export function findModule(ctx: RunContext, scope: Scope): Module {
  const ms = findModules(ctx, scope);
  if (ms.length === 0) {
    throw new Error(`findModule: expected one '${scope}' module, found none`);
  }
  if (ms.length > 1) {
    throw new Error(`findModule: expected exactly one '${scope}' module, found ${ms.length}`);
  }
  return ms[0]!;
}

/** Workspace dep map `{ name: "workspace:*" }` for the single module of
 *  `scope`. Throws if absent (via `findModule`) — guarantees the dep. */
export function scopeDepMap(ctx: RunContext, scope: Scope): Record<string, string> {
  return { [findModule(ctx, scope).name]: "workspace:*" };
}

/** Workspace dep map for ALL modules of `scope` (zero or more). Never
 *  throws — use where multiple modules are legitimate (e.g. software). */
export function scopeDepMaps(ctx: RunContext, scope: Scope): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of findModules(ctx, scope)) out[m.name] = "workspace:*";
  return out;
}

/**
 * Module set produced by `init` for the given BlockVars: one module per
 * base scope (root/block/model/ui/workflow/test) plus, when a platform
 * was selected, one `software` module. `--platform` is single-valued, so
 * `init` produces at most one software module; multi-software shapes only
 * arise via DISCOVERY on existing blocks.
 *
 * Single source of truth shared by the real `init` constructor and the
 * `simulateInit` test helper — keeping them in lockstep is what makes the
 * init→check zero-diff invariant meaningful.
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
    // single-software block. Multi-software blocks arise only via
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
  softwareBuild?: boolean;
  dryRun?: boolean;
};

export function createRunContext(input: CreateRunContextInput): RunContext {
  return {
    isSdkInternal: input.isSdkInternal ?? false,
    updateDepsOnly: input.updateDepsOnly ?? false,
    modules: input.modules,
    blockVars: input.blockVars,
    version: input.version ?? 0,
    softwareBuild: input.softwareBuild ?? false,
    dryRun: input.dryRun ?? false,
  };
}
