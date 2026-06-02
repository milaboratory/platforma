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
  when,
  whenFilesExist,
  ensureField,
  removeField,
  pruneKeysMatching,
} from "../engine/api";
import { getActiveRunContext } from "../engine/builders";
import { uiPackageJsonInitial, uiPackageJsonRules } from "./ui-package-json";
import { COLOCATED_TEST_GLOB } from "./shared/colocated-tests";

export function uiRules(): void {
  scope("ui", () => {
    // tsconfig is managed (not fixed) so node ambient types can be provided
    // CONDITIONALLY. The body still enforces the canonical shape —
    // `{extends, include}` with NO stray keys — and, ONLY when the ui
    // carries co-located unit tests (`src/**/*.test.ts`), adds
    // `compilerOptions.types: ["node"]` so tests importing `node:*`
    // type-check under vue-tsc: provide node types, do NOT exclude the
    // tests. A test-less ui is canonicalised to
    // bare `{extends, include}` and stays a refresh fixpoint. The matching
    // `@types/node` devDep is wired by the package.json rule under the same
    // predicate.
    managed("tsconfig.json", file("ui/tsconfig.json"), () => {
      ensureField("extends", "@milaboratories/ts-configs/block/ui");
      removeField("compilerOptions");
      when(whenFilesExist(COLOCATED_TEST_GLOB), () => {
        ensureField("compilerOptions.types", ["node"]);
      });
      ensureField("include", ["src/**/*"]);
      pruneKeysMatching((k) => k !== "extends" && k !== "include" && k !== "compilerOptions");
    });
    fixed(".oxlintrc.json", file("ui/.oxlintrc.json"));
    // Block-local oxfmt config — the ui is oxfmt-checked (`ts-builder check
    // --target block-ui`).
    fixed(".oxfmtrc.json", file("ui/.oxfmtrc.json"));
    // scaffold (not fixed): index.html carries a block-specific CSP. Write
    // the canonical default only when absent; never overwrite an author's.
    scaffold("index.html", file("ui/index.html"));

    // A minimal-but-real UI: mount (main.ts), app wiring the block model
    // (app.ts), and a landing page (MainPage.vue). An empty main.ts would
    // trip oxlint `unicorn(no-empty-file)`. Author-owned seeds: written once
    // at init, untouched on refresh.
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
      generate(() => uiPackageJsonInitial(getActiveRunContext())),
      () => {
        uiPackageJsonRules();
      },
    );
  });
}
