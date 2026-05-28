// Workflow-scope rules. The Tengo entry point is a templated seed
// (substitutes ${shortName}); other config files are static.

import { scope, fixed, managed, seed, file, tpl, generate, blockVars } from "../engine/api";
import { workflowPackageJsonInitial } from "../templates/generated/workflow-package-json";
import { workflowPackageJsonRules } from "./workflow-package-json";

export function workflowRules(): void {
  scope("workflow", () => {
    fixed("tsconfig.json", file("workflow/tsconfig.json"));
    fixed("vitest.config.mts", file("workflow/vitest.config.mts"));
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
