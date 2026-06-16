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
  blockVars,
} from "../engine/api";
import { getActiveRunContext } from "../engine/builders";
import { workflowPackageJsonInitial, workflowPackageJsonRules } from "./workflow-package-json";
import { COLOCATED_TEST_GLOB } from "./shared/colocated-tests";

export function workflowRules(): void {
  scope("workflow", () => {
    // tsconfig for the TypeScript vitest integration tests under src/test
    // (e.g. mixcr's workflow/src/test/columns.test.ts). types:[] keeps the
    // isomorphic workflow free of ambient Node/DOM types.
    fixed("tsconfig.json", file("workflow/tsconfig.json"));
    // Tengo source formatter (emacs batch); the `format` script invokes it.
    fixed("format.el", file("workflow/format.el"));
    // vitest config only when the workflow carries co-located tests
    // (`src/**/*.test.ts`, incl. `src/test/`) — paired with the conditional
    // `vitest` devDep + `test` script in workflow-package-json. scaffold (not
    // fixed): author-tunable when present; a test-less workflow gets none.
    when(
      whenFilesExist(COLOCATED_TEST_GLOB),
      () => scaffold("vitest.config.mts", file("workflow/vitest.config.mts")),
      () => remove("vitest.config.mts"),
    );
    // No workflow facade (index.js / index.d.ts): the block loader resolves the
    // workflow via the `block:` components dist path (workflow/dist/.../main.plj.gz),
    // never the JS facade. It was orphaned in production — dropped. Actively
    // removed so existing blocks that carry it get cleaned (idempotent on absence).
    remove("index.js");
    remove("index.d.ts");

    seed(
      "src/main.tpl.tengo",
      tpl("workflow/src/main.tpl.tengo", () => ({
        shortName: blockVars().shortName,
      })),
    );

    managed(
      "package.json",
      generate(() => workflowPackageJsonInitial(getActiveRunContext())),
      () => {
        workflowPackageJsonRules();
      },
    );
  });
}
