---
"@platforma-sdk/block-tools": patch
---

`structure refresh --update-deps-only` now also moves a block to the SDK pnpm and Node and writes the pnpm 12 workspace settings. So the first `pnpm i` of `upgrade-sdk` runs on the SDK pnpm, with its release-age check, and the lockfile no longer gets a release that the later install rejects. `--update-deps-only` now also refuses a `pnpm` field with settings in the root `package.json`, before any install.

New blocks no longer get `allowBuilds` entries for `ssh2` and `cpu-features`: the SDK no longer depends on them.

`upgrade-sdk` runs the `block-tools` installed in the block. A block on pnpm 9 or 10 gets the fix only from its next upgrade on. For its first upgrade, run `pnpm dlx @platforma-sdk/block-tools@latest structure refresh --update-deps-only` before `pnpm upgrade-sdk`.
