---
"@platforma-sdk/block-tools": minor
"@platforma-sdk/package-builder-lib": minor
---

Add the `block-tools software build` command: the single-pass software builder driven by
three knobs — `--channel`/`PL_BUILD_CHANNEL` (dev|release), `--variant`/`PL_BUILD_VARIANT`
(docker|binary|all|none), `--location`/`PL_BUILD_LOCATION` (local|remote) — plus
`--use-published`/`PL_BUILD_USE_PUBLISHED` (build-against-existing). It builds the artifact,
pushes it when the target is remote, then writes the `.sw.json` descriptor last (ready ⟺ the
descriptor exists).

`variant=all` builds every variant the software declares; `variant=none` builds no software and
emits a minimal `binary` placeholder descriptor per entrypoint, so a block can be built, loaded,
and rendered without any software (only executing it fails). With no knobs the command reproduces
`pl-pkg build` (release, version-derived, per-entrypoint variant, docker push only in CI, no
binary upload). Dev binary remote uploads a content-addressed archive to the dev binary registry
(endpoint via `PL_DEV_BINARY_UPLOAD_URL`). `location=ssh` and `ecr://` auto docker-login are not
yet implemented. The command is additive — no block is retargeted to it yet, and `pl-pkg` is
unchanged.
