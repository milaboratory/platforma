// RunContext assembly helpers. The full `RunContext` type lives in
// `api.ts` (rule authors see it via `({ ctx }) => ...` trigger
// predicates). This file provides convenience constructors.

import type { BlockVars, Module, RunContext } from "./api";

export type CreateRunContextInput = {
  isSdkInternal?: boolean;
  updateDeps?: boolean;
  modules: Module[];
  blockVars: BlockVars;
  version?: number;
  dryRun?: boolean;
};

export function createRunContext(input: CreateRunContextInput): RunContext {
  return {
    isSdkInternal: input.isSdkInternal ?? false,
    updateDeps: input.updateDeps ?? false,
    modules: input.modules,
    blockVars: input.blockVars,
    version: input.version ?? 0,
    dryRun: input.dryRun ?? false,
  };
}
