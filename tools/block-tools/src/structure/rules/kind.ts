// Kind-scope rules. Static config files + managed package.json; the
// `src/index.ts` scaffold is dropped once, on whichever run first finds it
// missing, and never touched again — the block author owns the BlockParams
// contract. What lands is a deliberate non-building sentinel: its BlockParams
// is undefined, so a scaffolded-but-unmigrated block fails to typecheck until
// the params contract is chosen on purpose.

import { scope, fixed, managed, scaffold, file, generate } from "../engine/api";
import { kindPackageJsonInitial, kindPackageJsonRules } from "./kind-package-json";

export function kindRules(): void {
  scope("kind", () => {
    fixed("tsconfig.json", file("kind/tsconfig.json"));
    fixed(".oxlintrc.json", file("kind/.oxlintrc.json"));
    fixed(".oxfmtrc.json", file("kind/.oxfmtrc.json"));

    // Minimal-but-real kind: identity imported from the package's own
    // package.json, plus a non-building BlockParams sentinel the block author
    // must resolve (via the migration recipe or by hand) before the block builds.
    //
    // `scaffold`, not `seed`: create-if-missing in EVERY mode, so `refresh`
    // bootstrapping a kind for a pre-kind block deposits the sentinel too. A
    // seed is init-only, which would have left such a block with a kind package
    // that has no entry point. Once the file exists the engine never touches it
    // — the params contract belongs to the block author.
    scaffold("src/index.ts", file("kind/src/index.ts"));

    managed(
      "package.json",
      generate((ctx) => kindPackageJsonInitial(ctx)),
      () => {
        kindPackageJsonRules();
      },
    );
  });
}
