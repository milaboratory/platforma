// Kind-scope rules. Static config files + managed package.json; the
// `src/index.ts` seed is dropped by `init` and never touched again (the block
// author owns the BlockParams contract).

import { scope, fixed, managed, seed, file, generate } from "../engine/api";
import { kindPackageJsonInitial, kindPackageJsonRules } from "./kind-package-json";

export function kindRules(): void {
  scope("kind", () => {
    fixed("tsconfig.json", file("kind/tsconfig.json"));
    fixed(".oxlintrc.json", file("kind/.oxlintrc.json"));
    fixed(".oxfmtrc.json", file("kind/.oxfmtrc.json"));

    // Minimal-but-real kind: identity imported from the package's own
    // package.json, an empty BlockParams contract. The block author owns and
    // extends it after init.
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
