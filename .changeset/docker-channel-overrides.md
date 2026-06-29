---
"@platforma-sdk/package-builder-lib": minor
"@platforma-sdk/block-tools": minor
---

Add per-channel docker address overrides to `block-tools software build`: `PL_DEV_DOCKER_PUSH_URL`
/ `PL_DEV_DOCKER_PULL_URL` and `PL_RELEASE_DOCKER_PUSH_URL` / `PL_RELEASE_DOCKER_PULL_URL`. The
push URL is where the image is pushed (dev defaults to the built-in dev registry, release to the
artifact's own registry); the pull URL is the address embedded in the descriptor and defaults to the
push URL. Explicit `--docker-registry`/`--docker-push-to` still win, and the bare pl-pkg-parity
invocation is unchanged. `ecr://`-scheme auto docker-login is handled separately.
