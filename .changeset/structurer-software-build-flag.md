---
"@platforma-sdk/block-tools": minor
---

Add a per-block `softwareBuild` rollout marker to the structurer. `block-tools structure refresh
--software-build` retargets a block's software leaf from `pl-pkg` to `block-tools software build`
(plus `do-pack`) and replaces the single `build:dev` script with the scenario set
(`build:dev-local`, `build:dev-remote`, `build:dev-no-software`, `build:dev-binary-existing`,
`build:release`) plus a dev-binary-local `test`. The dev-local/remote scripts build every variant
the software declares (`PL_BUILD_VARIANT=all`); docker-vs-binary is not a per-script choice. The
choice persists in `.structure`, so later plain refreshes keep the block migrated. Without the
flag, blocks keep building via `pl-pkg` — no change.
