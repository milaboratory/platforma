# @platforma-sdk/package-builder-lib

## 1.2.0

### Minor Changes

- a89523d: Add the `dev-remote` build mode: a dev-channel build that builds and uploads a binary
  archive (today's `dev-local` skips the archive and emits a same-host `local` descriptor).
  The `BuildMode` enum now separates the two axes it conflated — `isDevMode()` (channel: dev
  naming + `isDev` marker) and `producesRegistryDescriptor()` (descriptor shape: registry vs
  same-host). `dev-local` and `release` are unchanged.

  On the dev channel the embedded binary registry name is the built-in `midev`, flipping to
  `dev` and routing uploads to the developer's endpoint when `PL_DEV_BINARY_UPLOAD_URL` is set;
  `PL_RELEASE_BINARY_UPLOAD_URL` overrides the release upload endpoint without renaming. A
  referenced run environment keeps its own published registry. No default dev endpoint URL is
  committed — dev remote upload requires the endpoint to be supplied.

- 232ddef: Add per-channel docker address overrides to `block-tools software build`: `PL_DEV_DOCKER_PUSH_URL`
  / `PL_DEV_DOCKER_PULL_URL` and `PL_RELEASE_DOCKER_PUSH_URL` / `PL_RELEASE_DOCKER_PULL_URL`. The
  push URL is where the image is pushed (dev defaults to the built-in dev registry, release to the
  artifact's own registry); the pull URL is the address embedded in the descriptor and defaults to the
  push URL. Explicit `--docker-registry`/`--docker-push-to` still win, and the bare pl-pkg-parity
  invocation is unchanged. `ecr://`-scheme auto docker-login is handled separately.
- 51c230a: Automate the dev docker login for `block-tools software build` (A-0044). A push target written as
  `ecr://<host>/<repo>` triggers an automatic ECR `docker login` before the push; a plain `https://`
  or bare host opts out. The built-in dev default push target now uses the `ecr://` form, so dev push
  logs in by default. The scheme is stripped for the actual tag/push and for the descriptor's embedded
  pull address.

  The login token is fetched via the AWS SDK (`@aws-sdk/client-ecr-public`), reusing the same default
  credential chain as the S3 binary upload — environment variables first (CI), else the SSO profile
  (local). `AWS_PROFILE` is selected once, process-wide (`PL_AWS_PROFILE` override, default
  `research-poweruser`), so docker login and S3 upload use identical credentials. Login runs
  unconditionally (idempotent, ~1s): an expired or absent session fails at login with a clear
  `aws sso login` hint rather than surfacing an opaque error at push time. Public ECR is the only
  auto-login target. The build engine and `pl-pkg` are untouched — login lives in the block-tools
  layer.

- a6f7e3e: Add a built-in `midev` binary upload endpoint for dev push — `DEV_BINARY_UPLOAD_TARGET`
  (`s3://milab-midev-registry?region=eu-central-1`), the binary counterpart of the `ecr://` dev docker
  default. `block-tools software build --channel dev --location remote` now uploads the binary to the
  built-in midev registry with zero config, and the descriptor embeds the `midev` registry name (the
  backend resolves it to `bin-dev.pl-open.science`). `PL_DEV_BINARY_UPLOAD_URL` overrides the endpoint
  and flips the embedded registry name `midev` → `dev`.
- a89523d: Add the `block-tools software build` command: the single-pass software builder driven by
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

  The `--do`/`--no-do` tri-state flag resolver (`shouldDoAction`) moves to `package-builder-lib`'s
  `util` and is shared by both `pl-pkg` and the new command instead of being duplicated.

### Patch Changes

- 6890c99: Content-addressable dev artifact naming. In a non-release build, `artifactVersion()`
  now appends a short content hash (`-<12 hex>`) to the artifact version — the single
  point that feeds both the registry upload path and the `.sw.json` `package` field — so
  a rebuilt-but-changed dev artifact gets a new name and can never collide with a stale
  one. Release stays version-derived; docker is unchanged (already content-addressed via
  its image-ID tag). The hash is over relative paths + file contents with directory
  entries sorted, so identical content yields the same name regardless of build location
  or host. `hashDirSync` now sorts directory entries and recurses under the full relative
  path (fixing a `dirA/` vs `dirA/file` collision) for that determinism. This changes the
  hash algorithm, so existing dev-local `local.hash` values and dev version suffixes shift
  on the next rebuild (dev-only; release is unaffected). Also affects `--full-dir-hash`
  local descriptor hashes, which become stable across hosts.
- 0f7045a: Fail with a clear error when a docker software build targets a non-x64 platform. Docker images are
  built as `linux/amd64` only; an explicit `--platform`/target with an `aarch64` arch now errors
  naming the constraint instead of silently producing an amd64 image. The CI host skip
  (`strictPlatformMatching`) is unaffected.

## 1.1.0

### Minor Changes

- 8dc85d1: Extract the package-builder build engine into a new library package
  `@platforma-sdk/package-builder-lib` (`lib/node/package-builder-lib`). The engine
  (`Core` orchestrator, schemas, docker/conda builders, storage, archive, sw.json
  rendering) now lives in that library; `pl-pkg` (`@platforma-sdk/package-builder`)
  stays bin-only and depends on it. The `Core` class is intentionally not exported —
  the public surface is `createBuilder()` returning a `Builder` facade — so future
  consumers (e.g. `block-tools software`) wrap the engine rather than absorb its
  internals. No `pl-pkg` behavior change: the full command surface, flags, and
  output are identical.
