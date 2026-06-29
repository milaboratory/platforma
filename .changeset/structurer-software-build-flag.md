---
"@platforma-sdk/block-tools": minor
---

Add a per-block `softwareBuild` rollout marker to the structurer. `block-tools structure refresh
--software-build` retargets a block's software leaf from `pl-pkg` to `block-tools software build`
(plus `do-pack`) and replaces the single `build:dev` script with the channel/variant/location
scenario set (`build:dev-docker-local`, `build:dev-binary-local`, `build:dev-docker-remote`,
`build:dev-binary-remote`, `build:dev-binary-ssh`, `build:dev-binary-existing`, `build:release`)
plus a dev-binary-local `test`. The choice persists in `.structure`, so later plain refreshes keep
the block migrated. Without the flag, blocks keep building via `pl-pkg` — no change.
