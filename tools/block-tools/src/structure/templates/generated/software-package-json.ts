// Initial software `package.json` — see rules/software-package-json.ts.
// The slug (`software-python`, `software-tengo`) drives the module name
// suffix; resolution happens at fan-out time via ctx.modules.

import type { BlockVars } from "../../engine/api";
import { tryGetActiveRunContext } from "../../engine/builders";

/** Pick the active software module name based on `tryGetActiveRunContext`
 *  + the path-anchor convention `software-<slug>`. The generator is
 *  called once per fan-out item — we infer which one by inspecting the
 *  current modules list. Heuristic: first software module wins on a
 *  single-software block; multi-software requires per-fan-out resolution
 *  via a richer engine hook (step 5). */
export function softwarePackageJsonInitial(v: BlockVars): Record<string, unknown> {
  const ctx = tryGetActiveRunContext();
  const softwareName =
    ctx?.modules.find((m) => m.scope === "software")?.name ?? `${v.facadeName}.software`;
  return {
    name: softwareName,
    version: "1.0.0",
    private: true,
  };
}
