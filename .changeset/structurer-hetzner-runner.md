---
"@platforma-sdk/block-tools": patch
---

Run the generated block `build.yaml` workflow on the Hetzner CI runner.

The `build.tpl.yaml` template hard-coded `ubuntu-latest`, so every structurer
refresh reverted blocks already migrated to Hetzner back to GitHub-hosted
runners. Bake the Hetzner setup into the template: `runs-on: hz-ubuntu-dind`
for the `init` job, `gha-runner-label: hz-ubuntu-dind` for the reusable
workflow, and the `HZ_CI_*` turbo/cache S3 credentials in the secrets env.
Matches the manual migration in `clonotype-enrichment` and
`sequence-embeddings` byte-for-byte.
