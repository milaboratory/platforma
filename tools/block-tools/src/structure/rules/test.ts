// Test-scope rules.

import {
  scope,
  fixed,
  managed,
  scaffold,
  seed,
  file,
  text,
  generate,
  blockVars,
} from "../engine/api";
import { testPackageJsonInitial } from "../templates/generated/test-package-json";
import { testPackageJsonRules } from "./test-package-json";

export function testRules(): void {
  scope("test", () => {
    // tsconfig carries an explicit `files: []` alongside `include:
    // ["src/**/*"]`: a freshly-init'd block has no test sources yet (the
    // test-framework project seeds them later), and tsc errors `TS18003: No
    // inputs were found` when an `include` matches nothing. The empty `files`
    // array suppresses that error for an empty scope while `include` still
    // type-checks real tests once present — so the build/check gate passes on
    // a test-less block without forcing a fake test into the scaffold.
    fixed("tsconfig.json", file("test/tsconfig.json"));
    // scaffold (not fixed): integration tests legitimately tune timeout /
    // retry per block. Write the canonical default if absent; never
    // overwrite an author's config.
    scaffold("vitest.config.mts", file("test/vitest.config.mts"));

    // A trivial, backend-free demo test so a freshly-init'd block ships a
    // COMPLETE, runnable test suite (`pnpm test` green out of the box) rather
    // than an empty scope. Real integration tests (which need a live backend
    // via @platforma-sdk/test) are seeded later by the test-framework
    // project; this placeholder just demonstrates the harness works. Seed:
    // author-owned, written once at init, never touched on refresh.
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
      generate(() => testPackageJsonInitial(blockVars())),
      () => {
        testPackageJsonRules();
      },
    );
  });
}
