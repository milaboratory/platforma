// Model-scope rules. Static config files + managed package.json; the
// `src/index.ts` seed is dropped by `init` and never touched again
// (block author owns it).

import { scope, fixed, managed, seed, file, text, generate, blockVars } from "../engine/api";
import { modelPackageJsonInitial } from "../templates/generated/model-package-json";
import { modelPackageJsonRules } from "./model-package-json";

export function modelRules(): void {
  scope("model", () => {
    fixed("tsconfig.json", file("model/tsconfig.json"));
    fixed(".oxlintrc.json", file("model/.oxlintrc.json"));
    fixed(".oxfmtrc.json", file("model/.oxfmtrc.json"));

    seed("src/index.ts", text(`export const platforma = "model";\n`));

    managed(
      "package.json",
      generate(() => modelPackageJsonInitial(blockVars())),
      () => {
        modelPackageJsonRules();
      },
    );
  });
}
