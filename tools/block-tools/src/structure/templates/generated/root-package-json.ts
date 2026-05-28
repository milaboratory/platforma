// Initial root `package.json` — minimal skeleton.
// Body rules in `rules/root-package-json.ts` fill the rest. Source of
// truth for canonical content is the body; this template carries only
// identity fields the rules wouldn't otherwise know.

import type { BlockVars } from "../../engine/api";

export function rootPackageJsonInitial(v: BlockVars): Record<string, unknown> {
  return {
    name: v.facadeName,
    version: "1.0.0",
    private: true,
  };
}
