// UI-scope rules. Author owns src/main.ts and components; static config
// files are engine-managed.

import {
  scope,
  fixed,
  managed,
  scaffold,
  seed,
  file,
  tpl,
  generate,
  blockVars,
} from "../engine/api";
import { uiPackageJsonInitial } from "../templates/generated/ui-package-json";
import { uiPackageJsonRules } from "./ui-package-json";

export function uiRules(): void {
  scope("ui", () => {
    fixed("tsconfig.json", file("ui/tsconfig.json"));
    fixed(".oxlintrc.json", file("ui/.oxlintrc.json"));
    // ui needs its own .oxfmtrc.json (like model): without a block-local
    // oxfmt config, `ts-builder check --target block-ui` points oxfmt at a
    // bundled config path that ts-builder@1.5.0 fails to resolve. Real
    // canonical blocks + the boilerplate ship this file.
    fixed(".oxfmtrc.json", file("ui/.oxfmtrc.json"));
    // scaffold (not fixed): index.html carries the block's Content-Security-
    // Policy, which is block-specific (some blocks need `data:`). Write the
    // canonical default only when absent; never overwrite an author's CSP.
    scaffold("index.html", file("ui/index.html"));

    // A minimal-but-REAL UI: an empty `main.ts` trips oxlint
    // `unicorn(no-empty-file)`, and a complete block needs a UI that mounts
    // the SDK app and renders. Seed the canonical three-file entry — mount
    // (main.ts), app wiring the block model (app.ts), and a landing page
    // (MainPage.vue). All three are author-owned seeds: written once at init,
    // never touched on refresh.
    seed("src/main.ts", file("ui/src/main.ts"));
    seed(
      "src/app.ts",
      tpl("ui/src/app.tpl.ts", () => ({ modelPkg: `${blockVars().facadeName}.model` })),
    );
    seed(
      "src/MainPage.vue",
      tpl("ui/src/MainPage.tpl.vue", () => ({ shortName: blockVars().shortName })),
    );

    managed(
      "package.json",
      generate(() => uiPackageJsonInitial(blockVars())),
      () => {
        uiPackageJsonRules();
      },
    );
  });
}
