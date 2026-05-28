// Software-scope rules. One scope body, N modules — the engine fans out
// once per discovered software module (dsl-example.md § "Multi-module
// fan-out"). Zero software modules → entire scope body no-ops.

import { scope, managed, generate, blockVars } from "../engine/api";
import { softwarePackageJsonInitial } from "../templates/generated/software-package-json";
import { softwarePackageJsonRules } from "./software-package-json";

export function softwareRules(): void {
  scope("software", () => {
    managed(
      "package.json",
      generate(() => softwarePackageJsonInitial(blockVars())),
      () => {
        softwarePackageJsonRules();
      },
    );
  });
}
