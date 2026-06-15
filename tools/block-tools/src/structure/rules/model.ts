// Model-scope rules. Static config files + managed package.json; the
// `src/index.ts` seed is dropped by `init` and never touched again
// (block author owns it).

import { scope, fixed, managed, seed, file, generate, when, whenFilesExist } from "../engine/api";
import { getActiveRunContext } from "../engine/builders";
import { modelPackageJsonInitial, modelPackageJsonRules } from "./model-package-json";
import { COLOCATED_TEST_GLOB } from "./shared/colocated-tests";

export function modelRules(): void {
  scope("model", () => {
    // The canonical model tsconfig is fully engine-owned, so it is `fixed`
    // (not `managed`): declare the end state and overwrite, no field-level
    // reconciliation. It has exactly two end states, selected by whether the
    // model carries co-located unit tests (`src/**/*.test.ts`):
    //   - with tests  -> `{extends, compilerOptions: {types: ["node"]}, include}`
    //     so those tests type-check (provide node types, do NOT exclude them).
    //     `@types/node` is wired by the package.json rule under the same
    //     predicate.
    //   - without     -> bare `{extends, include}`.
    // Each is a static template, so refresh is idempotent by construction.
    when(
      whenFilesExist(COLOCATED_TEST_GLOB),
      () => fixed("tsconfig.json", file("model/tsconfig.node.json")),
      () => fixed("tsconfig.json", file("model/tsconfig.json")),
    );
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
      generate(() => modelPackageJsonInitial(getActiveRunContext())),
      () => {
        modelPackageJsonRules();
      },
    );
  });
}
