// Block-scope rules — the orchestrator package at `block/`.
// Workspace-scope deps in the body resolve from ctx.modules.

import { scope, fixed, managed, seed, file, binaryFile, generate } from "../engine/api";
import { blockPackageJsonInitial, blockPackageJsonRules } from "./block-package-json";

export function blockRules(): void {
  scope("block", () => {
    fixed("index.js", file("block/index.js"));
    fixed("index.d.ts", file("block/index.d.ts"));

    // Placeholder logos referenced by `block.meta` (logo + organization.logo).
    // Binary seeds: written once at init, author-owned thereafter — refresh
    // never overwrites them, so a custom logo survives. `block-tools pack`
    // embeds these into the block pack; without them pack would fail on the
    // `file:logos/...` meta references.
    seed("logos/block-logo.png", binaryFile("block/logos/block-logo.png"));
    seed("logos/organization-logo.png", binaryFile("block/logos/organization-logo.png"));

    managed(
      "package.json",
      generate((ctx) => blockPackageJsonInitial(ctx)),
      (ctx) => {
        blockPackageJsonRules(ctx);
      },
    );
  });
}
