---
"@platforma-sdk/block-tools": minor
---

`structure refresh` (and so `upgrade-sdk`) moves a block to the SDK toolchain: Node 24.22.1 and pnpm 12.16.1.

- Root `package.json`: `packageManager` is the SDK's pnpm, and `devEngines.runtime` is Node 24.22.1 with `onFail: download`, so pnpm runs the block scripts on that Node. Refresh overwrites `packageManager` and `devEngines.runtime`. It keeps other `devEngines` entries and `engines`.
- CI workflows: `node-version` is `24.22.1`.
- `pnpm-workspace.yaml`: `minimumReleaseAgeExclude` lists our scopes, so `upgrade-sdk` can install an SDK release less than a day old. `allowBuilds` lists the install scripts in the SDK dependency tree: `@milaboratories/pframes-rs-node` is always `true` (it downloads the native addon), and the others default to `false`. The `turbo` catalog entry is raised to at least `~2.11.10`: older turbo cannot read a pnpm 12 lockfile.
- pnpm 11+ ignores the `pnpm` field in `package.json`. Refresh removes an empty one and stops with an error when it holds settings; move them to `pnpm-workspace.yaml`.

After `upgrade-sdk`, a block needs pnpm 12 locally. pnpm downloads Node 24.22.1 for the block scripts.
