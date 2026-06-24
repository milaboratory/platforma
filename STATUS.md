# Software Build — Implementation Status

**State:** infrastructure underway (PRs
[#281](https://github.com/milaboratory/infrastructure/pull/281),
[#282](https://github.com/milaboratory/infrastructure/pull/282)); pl / platforma / blocks
not started. 4 repos. Within each repo, ordered as individually-testable increments,
riskier first. Each entry links the most detailed spec atom.

Spec front doors:

- [design-and-scope][ds]
- [implementor-reference][ir]
- [infrastructure-changes][ic]

**Cross-repo ordering.** `pl` and `infrastructure` are independent — start early. The
platforma remote-binary steps are unit-testable against a throwaway S3 (minio); the
real end-to-end check needs `pl` + `infrastructure` done. `blocks` rollout is last.

## infrastructure (`milaboratory/infrastructure`, Terraform; downstream ops)

- [x] S3 bucket `milab-midev-registry` (acct 934, private, AES256, 7-day GC) + BunnyCDN
      edge-read IAM user. PR
      [milaboratory/infrastructure#282](https://github.com/milaboratory/infrastructure/pull/282)
      — `plan` clean. [ic] §2
- [ ] Cross-account CI push to the bucket: 934 bucket policy + 511-role `s3:PutObject`
      (role TBD, likely `…-github-oidc-role-pl-registry`). [ic] §3
- [x] Dev docker ECR cross-account push (two accounts): repo policy on `pl-containers`
      (934, `terraform/miresearch/.../ecr-public-pl-containers`) + `ecr-public` login
      grant on the 511 `monorepo-simple` / `blocks` roles
      (`terraform/mik8s-github/oidc-roles/*`). PR
      [milaboratory/infrastructure#281](https://github.com/milaboratory/infrastructure/pull/281)
      — 934 `plan` clean, 511 stacks `validate`d (need main-account `plan` before apply). [ic] §1
- [ ] Confirm dev SSO role carries `ecr-public` push + `s3:PutObject` to the bucket. [ic] §4

Manual (not Terraform), post-apply:

- BunnyCDN pull zone `bin-dev.pl-open.science` → bucket, using an access key created by
  hand for the `milab-midev-registry-cdn` user. [ic] §2

Deferred / non-blocking:

- GA edge for the dev bucket — optional/later, out of scope. [ic] §5

## pl

- [ ] Add `midev` to `defaultRegistries()` (`controllers/packagectl/pkg/cfg/soft_ctl.go`)
      → `bin-dev.pl-open.science`. [A-0024]

## platforma

- [ ] `package-builder` (pl-pkg) oclif → commander — riskiest, touches the live tool;
      pl-pkg tests pass. [A-0025]
- [ ] `block-tools` oclif → commander — new `software build` lands here.
      [A-0018] [A-0025]
- [ ] Extract package-builder's build engine into a library (bin-only; `Core` not exported).
      [A-0023]
- [ ] Content-addressable dev naming: append `-<hash>` at `artifactVersion()`. [A-0014]
- [ ] Dev binary archive build+upload (dev builds no archive today). [A-0022]
- [ ] Descriptor-last write: `.sw.json` only after build (+push) succeeds. [A-0013]
- [ ] `block-tools software build` + knobs channel/variant/location (env + flags),
      `PL_BUILD_USE_PUBLISHED`. Default (no knobs) = **release**, version-derived
      `platforma-open`, per-entrypoint variant, no push outside CI — matches current
      `pl-pkg build`; dev scenarios set knobs explicitly. [A-0011] [A-0025]
- [ ] Clear error on unsupported target/arch (docker amd64-only); document, don't redesign.
      [A-0017]
- [ ] Channel overrides `PL_DEV_*`/`PL_RELEASE_*` (push/pull/upload; dev `midev→dev` flip).
      [A-0012] [A-0029]
- [ ] `ecr://` auto docker-login + AWS SDK cred chain (env-first / `pl-block-dev`). [A-0044]
- [ ] ssh/scp copy-to-remote + `local` descriptor re-point (`PL_BUILD_SSH_TARGET`). [A-0015]
- [ ] Build-against-existing: descriptor at the published **release** (`platforma-open`)
      version-derived binary, no build/push. [A-0016]
- [ ] Structurer `turbo.json` `env` rule (none today), keying the software leaf **and** the
      workflow package that embeds the descriptor. [A-0022] [A-0030]
- [ ] `build:<scenario>` + single `test` script set in block root (via template).
      [A-0026] [A-0027]
- [ ] Retarget monorepo blocks `etc/blocks/*`: `pl-pkg build` → `block-tools software build`,
      flag-gated. [A-0033]
- [ ] Retire `pl-pkg` build surface ~1–2 wks after confirmation (do last). [A-0033]

## blocks (`blocks/*`)

- [ ] Flag-gated rollout per production block; confirm; then remove flag (default-on). [A-0033]

## Out of scope

Backend/runner descriptor interpretation (frozen), server-selection for tests,
arch redesign, slim-facade work, dev-bucket GA edge.

[ds]: ../../docs/text/work/projects/testing-framework/software-build/design-and-scope.md
[ir]: ../../docs/text/work/projects/testing-framework/software-build/implementor-reference.md
[ic]: ../../docs/text/work/projects/testing-framework/software-build/infrastructure-changes.md
[A-0011]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0011-developer-interface.md
[A-0012]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0012-channels-and-registry-model.md
[A-0013]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0013-build-flow-envelope.md
[A-0014]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0014-content-addressable-naming.md
[A-0015]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0015-path-override-and-remote-delivery.md
[A-0016]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0016-build-against-existing-artifact.md
[A-0017]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0017-architecture-handling.md
[A-0018]: ../../docs/text/work/projects/testing-framework/software-build/work/atoms/A-0018-tool-placement.md
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
