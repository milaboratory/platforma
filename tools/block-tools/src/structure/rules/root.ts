// Root-scope rules — apply only to the standalone block layout (the
// pnpm workspace + tooling around the block). `--sdk-internal` blocks
// skip this whole scope: the parent monorepo owns root files. Hence the
// `when(({ ctx }) => !ctx.isSdkInternal, ...)` wrapper.

import { scope, when, fixed, managed, file, generate } from "../engine/api";
import { getActiveRunContext } from "../engine/builders";
import { rootPackageJsonInitial, rootPackageJsonRules } from "./root-package-json";
import { rootPnpmWorkspaceInitial, rootPnpmWorkspaceRules } from "./root-pnpm-workspace";
import { rootGitignoreRules } from "./root-gitignore";

export function rootRules(): void {
  scope("root", () => {
    when(
      ({ ctx }) => !ctx.isSdkInternal,
      () => {
        fixed("turbo.json", file("root/turbo.json"));
        fixed(".vscode/settings.json", file("root/.vscode/settings.json"));

        managed(
          "package.json",
          generate(() => rootPackageJsonInitial(getActiveRunContext())),
          () => {
            rootPackageJsonRules();
          },
        );

        managed(
          "pnpm-workspace.yaml",
          generate(() => rootPnpmWorkspaceInitial(getActiveRunContext())),
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
