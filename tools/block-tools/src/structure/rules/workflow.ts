// Workflow-scope rules. The Tengo entry point is a templated seed
// (substitutes ${shortName}); other config files are static.

import { scope, fixed, managed, scaffold, seed, file, tpl, generate, blockVars } from "../engine/api";
import { workflowPackageJsonInitial } from "../templates/generated/workflow-package-json";
import { workflowPackageJsonRules } from "./workflow-package-json";

export function workflowRules(): void {
  scope("workflow", () => {
    // No workflow tsconfig: pl-tengo compiles Tengo, not TS. Blocks that
    // keep an inline-TS helper test own their own tsconfig — the tool
    // neither creates nor removes it.
    // scaffold (not fixed): tengo test config is author-tunable.
    scaffold("vitest.config.mts", file("workflow/vitest.config.mts"));
    fixed("index.js", file("workflow/index.js"));
    fixed("index.d.ts", file("workflow/index.d.ts"));

    seed(
      "src/main.tpl.tengo",
      tpl("workflow/src/main.tpl.tengo", () => ({
        shortName: blockVars().shortName,
      })),
    );

    managed(
      "package.json",
      generate(() => workflowPackageJsonInitial(blockVars())),
      () => {
        workflowPackageJsonRules();
      },
    );
  });
}
