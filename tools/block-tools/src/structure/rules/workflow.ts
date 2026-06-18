// Workflow-scope rules. The Tengo entry point is a templated seed
// (substitutes ${shortName}); other config files are static.

import {
  scope,
  managed,
  fixed,
  scaffold,
  seed,
  file,
  tpl,
  generate,
  remove,
  when,
  whenFilesExist,
} from "../engine/api";
import { workflowPackageJsonInitial, workflowPackageJsonRules } from "./workflow-package-json";
import { COLOCATED_TEST_GLOB } from "./shared/colocated-tests";

export function workflowRules(): void {
  scope("workflow", () => {
    // Tengo source formatter (emacs batch); the `format` script invokes it.
    fixed("format.el", file("workflow/format.el"));
    // The TS-test tsconfig + vitest config exist ONLY when the workflow carries
    // co-located tests (`src/**/*.test.ts`, incl. `src/test/` — e.g. mixcr's
    // workflow/src/test/columns.test.ts). They pair with the conditional
    // `vitest` devDep + `test` script in workflow-package-json. tsconfig is
    // `fixed` (structural: types:[] keeps the isomorphic workflow free of
    // ambient Node/DOM types); vitest.config is `scaffold` (author-tunable once
    // present). A test-less workflow gets neither and stays a refresh fixpoint.
    //
    // Skipped entirely for sdk-internal (in-monorepo) blocks: they own their
    // test config under the monorepo's shared infrastructure (e.g. a bespoke
    // `vitest run --coverage` + `createVitestConfig`), which the structurer
    // must neither scaffold nor remove. See workflow-package-json.
    when(
      ({ ctx }) => !ctx.isSdkInternal,
      () =>
        when(
          whenFilesExist(COLOCATED_TEST_GLOB),
          () => {
            fixed("tsconfig.json", file("workflow/tsconfig.json"));
            scaffold("vitest.config.mts", file("workflow/vitest.config.mts"));
          },
          () => {
            remove("tsconfig.json");
            remove("vitest.config.mts");
          },
        ),
    );
    // No workflow facade (index.js / index.d.ts): the block loader resolves the
    // workflow via the `block:` components dist path (workflow/dist/.../main.plj.gz),
    // never the JS facade. Removed so blocks that carry one get cleaned
    // (idempotent on absence).
    remove("index.js");
    remove("index.d.ts");

    seed(
      "src/main.tpl.tengo",
      tpl("workflow/src/main.tpl.tengo", (ctx) => ({
        shortName: ctx.blockVars.shortName,
      })),
    );

    managed(
      "package.json",
      generate((ctx) => workflowPackageJsonInitial(ctx)),
      () => {
        workflowPackageJsonRules();
      },
    );
  });
}
