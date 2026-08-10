// Kind-scope rules. Static config files + managed package.json; the
// `src/index.ts` seed is dropped by `init` and never touched again (the block
// author owns the BlockParams contract). The seed is a deliberate non-building
// sentinel — its BlockParams is undefined, so a scaffolded-but-unmigrated block
// fails to typecheck until the params contract is chosen on purpose.

import { scope, fixed, managed, seed, file, generate } from "../engine/api";
import { kindPackageJsonInitial, kindPackageJsonRules } from "./kind-package-json";

export function kindRules(): void {
  scope("kind", () => {
    fixed("tsconfig.json", file("kind/tsconfig.json"));
    fixed(".oxlintrc.json", file("kind/.oxlintrc.json"));
    fixed(".oxfmtrc.json", file("kind/.oxfmtrc.json"));

    // Minimal-but-real kind: identity imported from the package's own
    // package.json, plus a non-building BlockParams sentinel the block author
    // must resolve (via the migration recipe or by hand) before the block builds.
    seed("src/index.ts", file("kind/src/index.ts"));

    managed(
      "package.json",
      generate((ctx) => kindPackageJsonInitial(ctx)),
      () => {
        kindPackageJsonRules();
      },
    );
  });
}
