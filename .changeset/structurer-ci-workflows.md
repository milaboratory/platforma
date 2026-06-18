---
"@platforma-sdk/block-tools": minor
---

structurer: manage the block CI workflows (`.github/workflows/build.yaml` and
`mark-stable.yaml`) as engine-owned (`fixed`) scaffold files, generated from
the block's short name. Brings the shared-CI pin (`@v4`) and job wiring under
central management so `refresh` keeps every block's workflow in sync; the only
per-block bits are derived (`app-name`, `app-name-slug`), with `team-id` and
the `test` toggle as shared constants. Standalone blocks only — `--sdk-internal`
blocks are unaffected.
