// UI-scope rules. Author owns src/main.ts and components; static config
// files are engine-managed.

import { scope, fixed, managed, scaffold, seed, file, text, generate, blockVars } from "../engine/api";
import { uiPackageJsonInitial } from "../templates/generated/ui-package-json";
import { uiPackageJsonRules } from "./ui-package-json";

export function uiRules(): void {
  scope("ui", () => {
    fixed("tsconfig.json", file("ui/tsconfig.json"));
    fixed(".oxlintrc.json", file("ui/.oxlintrc.json"));
    // scaffold (not fixed): index.html carries the block's Content-Security-
    // Policy, which is block-specific (some blocks need `data:`). Write the
    // canonical default only when absent; never overwrite an author's CSP.
    scaffold("index.html", file("ui/index.html"));

    seed("src/main.ts", text(`// UI entry point. Author owns this file.\n`));

    managed(
      "package.json",
      generate(() => uiPackageJsonInitial(blockVars())),
      () => {
        uiPackageJsonRules();
      },
    );
  });
}
