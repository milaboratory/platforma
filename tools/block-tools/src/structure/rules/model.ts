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
    // Two static end states by co-located-test presence: a test-bearing model
    // gets node ambient types (`.node.json`) so the tests type-check —
    // `@types/node` is wired alongside by the package.json rule; a test-less
    // model stays bare. `fixed` (engine-owned, whole-file overwrite) not
    // `managed`, so refresh is idempotent by construction — no key-order drift.
    when(
      whenFilesExist(COLOCATED_TEST_GLOB),
      () => fixed("tsconfig.json", file("model/tsconfig.node.json")),
      () => fixed("tsconfig.json", file("model/tsconfig.json")),
    );
    fixed(".oxlintrc.json", file("model/.oxlintrc.json"));
    fixed(".oxfmtrc.json", file("model/.oxfmtrc.json"));

    // A minimal-but-REAL BlockModelV3 wired to the block's kind (mandatory):
    // `build-model` rejects a non-model export, and `.create` without args
    // errors ("Args rendering function not set"). This seed is the smallest
    // chain that produces a valid `dist/model.json` — a kind-carrying data
    // model, identity args, a single "Main" section. The kind package name is
    // per-block, so this is a `tpl` (not a static `file`). The block author owns
    // and extends it after init.
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
