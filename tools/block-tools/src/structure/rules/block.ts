// Block-scope rules — the orchestrator package at `block/`.
// Workspace-scope deps in the body resolve from ctx.modules.

import { scope, fixed, managed, file, generate, blockVars } from "../engine/api";
import { blockPackageJsonInitial } from "../templates/generated/block-package-json";
import { blockPackageJsonRules } from "./block-package-json";

export function blockRules(): void {
  scope("block", () => {
    fixed("index.js", file("block/index.js"));
    fixed("index.d.ts", file("block/index.d.ts"));

    managed(
      "package.json",
      generate(() => blockPackageJsonInitial(blockVars())),
      () => {
        blockPackageJsonRules();
      },
    );
  });
}
