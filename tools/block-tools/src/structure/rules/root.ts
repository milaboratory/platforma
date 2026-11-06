// Root-scope rules — apply only to the standalone block layout (the
// pnpm workspace + tooling around the block). `--sdk-internal` blocks
// skip this whole scope: the parent monorepo owns root files. Hence the
// `when(({ ctx }) => !ctx.isSdkInternal, ...)` wrapper.

import { scope, when, fixed, managed, seed, file, text, generate } from "../engine/api";
import { rootPackageJsonInitial, rootPackageJsonRules } from "./root-package-json";
import { rootTurboJsonInitial, rootTurboJsonRules } from "./root-turbo-json";
import { rootPnpmWorkspaceInitial, rootPnpmWorkspaceRules } from "./root-pnpm-workspace";
import { rootGitignoreRules } from "./root-gitignore";
import {
  rootChangesetConfigInitial,
  rootChangesetConfigRules,
  EMPTY_CHANGESET_SEED,
} from "./root-changeset-config";

export function rootRules(): void {
  scope("root", () => {
    when(
      ({ ctx }) => !ctx.isSdkInternal,
      () => {
        managed(
          "turbo.json",
          generate(() => rootTurboJsonInitial()),
          () => {
            rootTurboJsonRules();
          },
        );
        fixed(".vscode/settings.json", file("root/.vscode/settings.json"));

        managed(
          "package.json",
          generate(() => rootPackageJsonInitial()),
          () => {
            rootPackageJsonRules();
          },
        );

        managed(
          "pnpm-workspace.yaml",
          generate((ctx) => rootPnpmWorkspaceInitial(ctx)),
          () => {
            rootPnpmWorkspaceRules();
          },
        );

        // The template has no dot: `pnpm pack` (pnpm 11+) leaves every
        // `.gitignore` out of the published package.
        managed(".gitignore", file("root/gitignore"), () => {
          rootGitignoreRules();
        });

        managed(
          ".changeset/config.json",
          generate((ctx) => rootChangesetConfigInitial(ctx)),
          (ctx) => {
            rootChangesetConfigRules(ctx);
          },
        );
        seed(".changeset/scaffold.md", text(EMPTY_CHANGESET_SEED));
      },
    );
  });
}
