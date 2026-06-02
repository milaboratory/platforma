// Root-scope rules — apply only to the standalone block layout (the
// pnpm workspace + tooling around the block). `--sdk-internal` blocks
// skip this whole scope: the parent monorepo owns root files. Hence the
// `when(({ ctx }) => !ctx.isSdkInternal, ...)` wrapper.

import { scope, when, fixed, managed, file, generate, blockVars } from "../engine/api";
import { rootPackageJsonInitial } from "../templates/generated/root-package-json";
import { rootPnpmWorkspaceInitial } from "../templates/generated/root-pnpm-workspace";
import { rootPackageJsonRules } from "./root-package-json";
import { rootPnpmWorkspaceRules } from "./root-pnpm-workspace";
import { rootGitignoreRules } from "./root-gitignore";

export function rootRules(): void {
  scope("root", () => {
    when(
      ({ ctx }) => !ctx.isSdkInternal,
      () => {
        // see templates/static/root/turbo.json — verbatim canonical content.
        fixed("turbo.json", file("root/turbo.json"));
        fixed(".vscode/settings.json", file("root/.vscode/settings.json"));

        managed(
          "package.json",
          generate(() => rootPackageJsonInitial(blockVars())),
          () => {
            rootPackageJsonRules();
          },
        );

        managed(
          "pnpm-workspace.yaml",
          generate(() => rootPnpmWorkspaceInitial()),
          () => {
            rootPnpmWorkspaceRules();
          },
        );

        managed(".gitignore", file("root/.gitignore"), () => {
          rootGitignoreRules();
        });
      },
    );
  });
}
