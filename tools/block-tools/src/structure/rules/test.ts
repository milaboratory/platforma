// Test-scope rules.

import { scope, fixed, managed, scaffold, seed, file, text, generate } from "../engine/api";
import { getActiveRunContext } from "../engine/builders";
import { testPackageJsonInitial, testPackageJsonRules } from "./test-package-json";

export function testRules(): void {
  scope("test", () => {
    // tsconfig carries `files: []` alongside `include: ["src/**/*"]`: tsc
    // errors TS18003 when an `include` matches nothing, so an empty `files`
    // lets the check pass on a test-less block while `include` still
    // type-checks real tests once present.
    fixed("tsconfig.json", file("test/tsconfig.json"));
    // scaffold (not fixed): integration tests legitimately tune timeout /
    // retry per block. Write the canonical default if absent; never
    // overwrite an author's config.
    scaffold("vitest.config.mts", file("test/vitest.config.mts"));

    // A trivial, backend-free demo test so a freshly-init'd block ships a
    // runnable suite (`pnpm test` green out of the box) rather than an empty
    // scope. Author-owned seed: written once at init, untouched on refresh.
    seed(
      "src/demo.test.ts",
      text(
        `import { expect, test } from "vitest";\n\n` +
          `test("scaffolded block sanity check", () => {\n` +
          `  expect(true).toBe(true);\n` +
          `});\n`,
      ),
    );

    managed(
      "package.json",
      generate(() => testPackageJsonInitial(getActiveRunContext())),
      () => {
        testPackageJsonRules();
      },
    );
  });
}
