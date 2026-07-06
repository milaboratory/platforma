# Software Build — Implementation Status

**State:** infrastructure §1–§4 done — all in PR
[milaboratory/infrastructure#281](https://github.com/milaboratory/infrastructure/pull/281)
(pending merge + apply; §4 needs no change); pl done — PR
[milaboratory/pl#2004](https://github.com/milaboratory/pl/pull/2004) (pending merge);
platforma in progress (package-builder oclif→commander done, this branch); blocks
not started. 4 repos.
Within each repo, ordered as individually-testable increments, riskier first. Each entry
links the most detailed spec atom.

Spec front doors:

- [design-and-scope][ds]
- [implementor-reference][ir]
- [infrastructure-changes][ic]

**Spec revised** on branch `feat/software-build-script-flavors` (not yet merged): the
developer script set collapses (docker-vs-binary no longer a choice; build emits every
declared variant), adds a no-software mode, and drops the ssh route. Items below reflect it;
the already-emitted script set is flagged as drift pending rework.

**Cross-repo ordering.** `pl` and `infrastructure` are independent — start early. The
platforma remote-binary steps are unit-testable against a throwaway S3 (minio); the
real end-to-end check needs `pl` + `infrastructure` done. `blocks` rollout is last.

## infrastructure (`milaboratory/infrastructure`, Terraform; downstream ops)

- [x] S3 bucket `milab-midev-registry` (acct 934, private, AES256, 7-day GC) + BunnyCDN
      edge-read IAM user. PR #281 — `plan` clean. [ic] §2
- [x] Cross-account CI push to the bucket: 934 bucket policy + matching grant on the 511
      `monorepo-simple` / `blocks` roles (`s3:ListBucket` + `s3:PutObject`). PR #281 —
      `plan` clean, 511 stacks `validate`d. [ic] §3
- [x] Dev docker ECR cross-account push (two accounts): repo policy on `pl-containers`
      (934, `terraform/miresearch/.../ecr-public-pl-containers`) + `ecr-public` login
      grant on the 511 `monorepo-simple` / `blocks` roles
      (`terraform/mik8s-github/oidc-roles/*`). PR
      [milaboratory/infrastructure#281](https://github.com/milaboratory/infrastructure/pull/281)
      — 934 `plan` clean, 511 stacks `validate`d (need main-account `plan` before apply). [ic] §1
- [x] Dev SSO push access — confirmed: 934 devs use the **PowerUser** permission set
      (`PowerUserAccess` = allow-all except iam/org/account), covering `ecr-public` push +
      `s3:PutObject`. No change (permission sets live in Identity Center, not this repo). [ic] §4

Manual (not Terraform), post-apply:

- BunnyCDN pull zone `bin-dev.pl-open.science` → bucket, using an access key created by
  hand for the `milab-midev-registry-cdn` user. [ic] §2

Deferred / non-blocking:

- GA edge for the dev bucket — optional/later, out of scope. [ic] §5

## pl

- [x] Add `midev` to `defaultRegistries()` (`controllers/packagectl/pkg/cfg/soft_ctl.go`)
      → `bin-dev.pl-open.science`. PR [milaboratory/pl#2004](https://github.com/milaboratory/pl/pull/2004). [A-0024]

## platforma

- [x] `package-builder` (pl-pkg) oclif → commander — riskiest, touches the live tool;
      pl-pkg tests pass. Per-command files kept (logic verbatim); full command
      surface preserved. [A-0025]
- [x] `block-tools` oclif → commander — framework swap only (full 13-command
      surface preserved, per-command files kept, library exports untouched).
      New `software build` still to land here (separate item). [A-0018] [A-0025]
- [x] Extract package-builder's build engine into a library — new
      `@platforma-sdk/package-builder-lib` (`lib/node/`); `pl-pkg` stays bin-only and
      depends on it. `Core` not exported; public surface is `createBuilder()`/`Builder`.
      pl-pkg + engine tests pass; CLI surface unchanged. [A-0023]
- [x] Content-addressable dev naming: append `-<hash>` at `artifactVersion()`. [A-0014]
      Gated on non-release build mode at `artifactVersion()` (`package-builder-lib`); dev
      gets a `-<12hex>` content suffix, release/docker unchanged. Dormant until the dev
      binary upload path (next item) writes a registry `package` path; unit-tested now.
- [x] Dev binary archive build+upload (dev builds no archive today). [A-0022]
      New `dev-remote` build mode in `package-builder-lib`: builds the archive (dev-local
      still skips) and uploads it; engine resolves the endpoint from `PL_DEV_BINARY_UPLOAD_URL`.
- [x] Descriptor-last write: `.sw.json` only after build (+push) succeeds. [A-0013]
      `software build` orders build → push → `buildSwJsonFiles` last in one pass.
- [x] `block-tools software build` + knobs channel/variant/location (env + flags),
      `PL_BUILD_USE_PUBLISHED`. Default (no knobs) = **release**, version-derived
      `platforma-open`, per-entrypoint variant, no push outside CI — matches current
      `pl-pkg build`; dev scenarios set knobs explicitly. [A-0011] [A-0025]
      Verified byte-identical to `pl-pkg build` (release + `--dev local`) on a real leaf.
      `pl-pkg` untouched; no block retargeted yet.
- [x] Clear error on unsupported target/arch (docker amd64-only); document, don't redesign.
      [A-0017]
      `buildDockerImages` throws when an explicit non-x64 target is requested, before any
      `docker build`. CI host skip (`strictPlatformMatching`) unaffected.
- [x] Channel overrides `PL_DEV_*`/`PL_RELEASE_*` (push/pull/upload; dev `midev→dev` flip).
      [A-0012] [A-0029]
      Binary upload override (`PL_DEV_BINARY_UPLOAD_URL` + `midev→dev` flip,
      `PL_RELEASE_BINARY_UPLOAD_URL`) and docker push/pull overrides (`PL_DEV_DOCKER_PUSH_URL`/
      `PULL_URL`, `PL_RELEASE_DOCKER_*`) done. Docker push carries the channel's built-in default,
      pull defaults to push; channel overrides apply to channel targets only — the bare pl-pkg-parity
      invocation is untouched. The `ecr://` auto-login that a dev push URL can trigger is A-0044.
- [x] `ecr://` auto docker-login + AWS SDK cred chain (env-first / SSO profile). [A-0044]
      Push-target scheme (`cmd/software/ecr-login.ts`): the built-in dev default
      (`DEV_DOCKER_PUSH_TARGET = ecr://…`) triggers an ECR `docker login` before push; a plain
      `https://`/bare host opts out. Scheme stripped for the tag/push and the embedded pull address.
      Token fetched via the AWS **SDK** (`@aws-sdk/client-ecr-public`) — same default cred chain as
      the S3 upload; login runs **unconditionally** (idempotent ~1s) so an expired session fails at
      login with a clear hint, not opaquely at push. `ensureAwsProfile` sets `AWS_PROFILE` once
      (env-creds-first, else `PL_AWS_PROFILE` ?? `research-poweruser`), so docker + S3 share one
      chain. Public ECR only (the sole ecr:// target). Engine/pl-pkg untouched (login lives in the
      block-tools layer).
      **Spec drift:** A-0044 (+README/design/impl-ref) name profile `pl-block-dev`, which does not
      exist in the real SSO setup — code uses `research-poweruser` per DevOps. Reconcile the spec.
- [x] Build-against-existing: descriptor at the published **release** (`platforma-open`)
      version-derived binary, no build/push. [A-0016]
      `--use-published`/`PL_BUILD_USE_PUBLISHED` → `writePublishedArtifactInfo` synthesizes the
      artifact-info from version-derived naming, reusing the release render path.
- [x] Structurer `turbo.json` `env` rule, keying the software leaf **and** the
      workflow package that embeds the descriptor. [A-0022] [A-0030]
      The root `build` task `env` now lists all software-build vars (`PL_BUILD_*`, `PL_DEV_*`,
      `PL_RELEASE_*`), so every package's build (software leaf + workflow) cache-keys on them.
      Declared once from `softwareBuildCacheEnv` (`cmd/software/env.ts`); a test fails if the
      template drifts. `PL_PKG_DEV` kept for the pl-pkg transition.
- [~] `build:<scenario>` + single `test` script set in block root (via template).
      [A-0021] [A-0026] [A-0027]
      Structurer emits the scenario set + dev-binary-local `test`, retargets the software leaf
      to `block-tools software build` (+ `do-pack`), gated on the per-block `softwareBuild`
      marker (`refresh --software-build`, persisted in `.structure`). Default-off → blocks
      unchanged. No block enrolled yet.
      Emits the collapsed A-0021@4.0 set — `build:dev-local` / `build:dev-remote` (both
      `variant=all`) / `build:dev-no-software` (`variant=none`) / `build:dev-binary-existing` /
      `build:release`.
- [x] `PL_BUILD_VARIANT` extended to `all` / `none`. `all` = build every variant the software
      declares (the value the scripts pass); `none` = no-software. [A-0025]
- [x] No-software build: `PL_BUILD_VARIANT=none` → minimal `binary` placeholder `.sw.json` per
      entrypoint (`SwJsonRenderer.renderPlaceholderEntrypoints`), nothing built or pushed, driven
      by `build:dev-no-software`. Ships the `binary` placeholder (safe superset) until Q-0021
      settles validator behaviour. [A-0046] [A-0047]
- [x] Retarget monorepo software: `pl-pkg build` → `block-tools software build`. [A-0033]
      `etc/blocks/*` carry no software (model/workflow/UI only), so the structurer `--software-build`
      flag has nothing to enroll there. The actual monorepo `pl-pkg build` software leaves are
      `lib/ptabler/software` and `lib/ptexter`; swapped their `build`/`do-pack` scripts directly
      (no-knob `software build` = pl-pkg parity). Verified: both build, emitting descriptors
      byte-identical to `pl-pkg build` (release `platforma-open`, version-derived, no dev hash).
      `prepublishOnly` stays on `pl-pkg prepublish` (no `software` equivalent; pl-pkg coexists).
      Test fixtures (`tests/package-builder/*`, `tests/tengo-builder/2-artifacts`) stay on pl-pkg.
- [ ] Retire `pl-pkg` build surface ~1–2 wks after confirmation (do last). [A-0033]

## blocks (`blocks/*`)

- [ ] Flag-gated rollout per production block; confirm; then remove flag (default-on). [A-0033]

## Out of scope

Backend/runner descriptor interpretation (frozen), server-selection for tests,
arch redesign, slim-facade work, dev-bucket GA edge, ssh/scp remote delivery
(dev remote registry covers it; A-0015 archived on the branch — future option only).

[ds]: ../../docs/text/work/projects/testing-framework/software-build/design-and-scope.md
[ir]: ../../docs/text/work/projects/testing-framework/software-build/implementor-reference.md
[ic]: ../../docs/text/work/projects/testing-framework/software-build/infrastructure-changes.md
[A-0011]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0011-developer-interface.md
[A-0012]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0012-channels-and-registry-model.md
[A-0013]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0013-build-flow-envelope.md
[A-0014]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0014-content-addressable-naming.md
[A-0016]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0016-build-against-existing-artifact.md
[A-0017]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0017-architecture-handling.md
[A-0018]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0018-tool-placement.md
[A-0021]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0021-scenario-vocabulary.md
[A-0022]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0022-gap-assessment.md
[A-0023]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0023-spike-follow-up-decisions.md
[A-0024]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0024-midev-builtin-home.md
[A-0025]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0025-cli-surface.md
[A-0026]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0026-script-set.md
[A-0027]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0027-script-set-example.md
[A-0029]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0029-channels-env-reference.md
[A-0030]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0030-build-tool-monorepo-connection.md
[A-0033]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0033-migration-rollout-plan.md
[A-0044]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0044-automated-docker-login-and-creds.md
[A-0046]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0046-no-software-build.md
[A-0047]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0047-runnable-form-grounding.md
