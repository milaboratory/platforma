// Test-scope rules.

import { scope, fixed, managed, scaffold, file, generate, blockVars } from "../engine/api";
import { testPackageJsonInitial } from "../templates/generated/test-package-json";
import { testPackageJsonRules } from "./test-package-json";

export function testRules(): void {
  scope("test", () => {
    fixed("tsconfig.json", file("test/tsconfig.json"));
    // scaffold (not fixed): integration tests legitimately tune timeout /
    // retry per block. Write the canonical default if absent; never
    // overwrite an author's config.
    scaffold("vitest.config.mts", file("test/vitest.config.mts"));

    managed(
      "package.json",
      generate(() => testPackageJsonInitial(blockVars())),
      () => {
        testPackageJsonRules();
      },
    );
  });
}
