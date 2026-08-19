---
"@platforma-sdk/block-tools": patch
---

Stop stripping the `mark-stable` script from the block facade on `structure refresh`.

The facade rule carried an unconditional `removeScript("mark-stable")`, classifying the
script as pre-facade boilerplate. It is not boilerplate: the engine-generated
`.github/workflows/mark-stable.yaml` calls the reusable
`milaboratory/github-ci/.github/workflows/block-mark-stable.yaml@v4`, which does
`cd block && pnpm run mark-stable`. Blocks migrated to the new layout lost the script and
their "Mark Platforma Block as Stable" workflow fails with
`ERR_PNPM_NO_SCRIPT  Missing script: mark-stable`.

This also restores what A-0013 specifies: the engine overwrites the canonical
`build`/`check`/`prepublishOnly`/`do-pack` scripts and leaves block-specific scripts
beyond that set alone.
