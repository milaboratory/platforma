# tengo-builder — Versioning Rule

Block CI runs a `require-latest` check (`milaboratory/github-ci`, `actions/node/require-latest`) on `@platforma-sdk/tengo-builder`. The check fails a block whose version is on an older **major** than the `latest` dist-tag. Minor and patch differences pass.

A major bump is therefore the only signal that forces every block to upgrade. Choose the changeset level with that in mind.

## When To Bump Major

Use a `major` changeset when a block built with the previous version must not be released any more:

- The format of the compiled output changes, and output of the old version does not work with the current SDK or backend.
- The previous version produces wrong or incomplete build output, and the fix has no effect until the block upgrades.
- The change breaks the public API or CLI (normal semver).

## When Not To

Use `minor` or `patch` for everything else. New features, fixes for a problem that only some blocks hit, and refactors do not need every block to upgrade. A major bump for these stops the merge queue of every block until each one upgrades.

## What To Write In The Changeset

Say in the changeset text why every block must upgrade. Block authors read it when their CI fails.
