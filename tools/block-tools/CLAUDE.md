# block-tools — Versioning Rule

Block CI runs a `require-latest` check (`milaboratory/github-ci`, `actions/node/require-latest`) on `@platforma-sdk/block-tools`. The check fails a block whose version is on an older **major** than the `latest` dist-tag. Minor and patch differences pass.

A major bump is therefore the only signal that forces every block to upgrade. Choose the changeset level with that in mind.

## When To Bump Major

Use a `major` changeset when a block built or published with the previous version must not be released any more:

- The format of the data this package writes to a block registry changes, and the old and new versions cannot share a registry. Example: the old version removes or overwrites entries written by the new version.
- The previous version publishes wrong or incomplete results, and the fix has no effect until the block upgrades.
- The change breaks the public API or CLI (normal semver).

## When Not To

Use `minor` or `patch` for everything else. New features, fixes for a problem that only some blocks hit, and refactors do not need every block to upgrade. A major bump for these stops the merge queue of every block until each one upgrades.

## What To Write In The Changeset

Say in the changeset text why every block must upgrade. Block authors read it when their CI fails.
