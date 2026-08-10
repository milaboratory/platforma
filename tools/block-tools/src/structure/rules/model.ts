// Model-scope rules. Static config files + managed package.json; the
// `src/index.ts` seed is dropped by `init` and never touched again
// (block author owns it).

import {
  scope,
  fixed,
  managed,
  seed,
  file,
  tpl,
  generate,
  when,
  whenFilesExist,
} from "../engine/api";
import { modelPackageJsonInitial, modelPackageJsonRules } from "./model-package-json";
import { COLOCATED_TEST_GLOB } from "./shared/colocated-tests";

export function modelRules(): void {
  scope("model", () => {
    when(
      whenFilesExist(COLOCATED_TEST_GLOB),
      () => fixed("tsconfig.json", file("model/tsconfig.node.json")),
      () => fixed("tsconfig.json", file("model/tsconfig.json")),
    );
    fixed(".oxlintrc.json", file("model/.oxlintrc.json"));
    fixed(".oxfmtrc.json", file("model/.oxfmtrc.json"));

    seed(
      "src/index.ts",
      tpl("model/src/index.tpl.ts", (ctx) => ({ kindPkg: `${ctx.blockVars.facadeName}.kind` })),
    );

    managed(
      "package.json",
      generate((ctx) => modelPackageJsonInitial(ctx)),
      () => {
        modelPackageJsonRules();
      },
    );
  });
}
