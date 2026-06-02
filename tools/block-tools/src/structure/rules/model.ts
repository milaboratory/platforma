// Model-scope rules. Static config files + managed package.json; the
// `src/index.ts` seed is dropped by `init` and never touched again
// (block author owns it).

import {
  scope,
  fixed,
  managed,
  seed,
  file,
  generate,
  when,
  whenFilesExist,
  ensureField,
  removeField,
  pruneKeysMatching,
} from "../engine/api";
import { getActiveRunContext } from "../engine/builders";
import { modelPackageJsonInitial, modelPackageJsonRules } from "./model-package-json";
import { COLOCATED_TEST_GLOB } from "./shared/colocated-tests";

export function modelRules(): void {
  scope("model", () => {
    // tsconfig is managed (not fixed) so node ambient types can be provided
    // CONDITIONALLY. The body still enforces the canonical shape (what the
    // old `fixed` form guaranteed) — `{extends, include}` with NO stray
    // keys — and, ONLY when the model carries co-located unit tests
    // (`src/**/*.test.ts`), adds `compilerOptions.types: ["node"]` so those
    // tests type-check (FC-5b — provide node types, do NOT exclude the
    // tests). A test-less model is canonicalised to bare `{extends, include}`
    // and stays a refresh fixpoint. The matching `@types/node` devDep is
    // wired by the package.json rule under the same predicate.
    managed("tsconfig.json", file("model/tsconfig.json"), () => {
      ensureField("extends", "@milaboratories/ts-configs/block/model");
      // Canonical default carries no compilerOptions; drop any legacy block's
      // before (conditionally) re-adding only `types`.
      removeField("compilerOptions");
      when(whenFilesExist(COLOCATED_TEST_GLOB), () => {
        ensureField("compilerOptions.types", ["node"]);
      });
      ensureField("include", ["src/**/*"]);
      // Strip anything else a legacy tsconfig carried (files, references, a
      // different extends layout) — keep only the canonical keys.
      pruneKeysMatching((k) => k !== "extends" && k !== "include" && k !== "compilerOptions");
    });
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
