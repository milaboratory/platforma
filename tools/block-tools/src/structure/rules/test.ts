// Test-scope rules.

import { scope, fixed, managed, file, generate, blockVars } from "../engine/api";
import { testPackageJsonInitial } from "../templates/generated/test-package-json";
import { testPackageJsonRules } from "./test-package-json";

export function testRules(): void {
  scope("test", () => {
    fixed("tsconfig.json", file("test/tsconfig.json"));
    fixed("vitest.config.mts", file("test/vitest.config.mts"));

    managed(
      "package.json",
      generate(() => testPackageJsonInitial(blockVars())),
      () => {
        testPackageJsonRules();
      },
    );
  });
}
