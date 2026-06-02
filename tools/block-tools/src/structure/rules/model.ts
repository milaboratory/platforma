// Model-scope rules. Static config files + managed package.json; the
// `src/index.ts` seed is dropped by `init` and never touched again
// (block author owns it).

import { scope, fixed, managed, seed, file, generate, blockVars } from "../engine/api";
import { modelPackageJsonInitial } from "../templates/generated/model-package-json";
import { modelPackageJsonRules } from "./model-package-json";

export function modelRules(): void {
  scope("model", () => {
    fixed("tsconfig.json", file("model/tsconfig.json"));
    fixed(".oxlintrc.json", file("model/.oxlintrc.json"));
    fixed(".oxfmtrc.json", file("model/.oxfmtrc.json"));

    // A minimal-but-REAL BlockModelV3: `build-model` rejects a non-model
    // export ("Malformed model object"), and a bare `.create(dataModel)`
    // still errors ("Args rendering function not set"). This seed is the
    // smallest chain that produces a valid `dist/model.json` — empty data
    // model, identity args, a single "Main" section. The block author owns
    // and extends it after init.
    seed("src/index.ts", file("model/src/index.ts"));

    managed(
      "package.json",
      generate(() => modelPackageJsonInitial(blockVars())),
      () => {
        modelPackageJsonRules();
      },
    );
  });
}
