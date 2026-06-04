---
"@platforma-sdk/package-builder": minor
---

Add `build:dev-remote` flow for publishing block-software dev images to a public ECR.

Block developers can now invoke `pnpm run build:dev-remote` (env `PL_DOCKER_BUILD=1 PL_DOCKER_AUTOPUSH=1`) to cross-compile a `linux/amd64` docker image and push it to `public.ecr.aws/u5p1x5q2/pl-containers` (override via `PL_DOCKER_REGISTRY` / `PL_DOCKER_REGISTRY_PUSH_TO`). `pnpm run build:dev` keeps its previous no-docker behaviour so the dev loop stays fast.

Other fixes shipped together:

- Drop the host-arch gate; cross-compile to `linux/amd64` via qemu on non-x64 hosts. CI-side strict-platform gate kept so only the linux/x64 matrix leg builds + pushes.
- Disable buildkit SLSA provenance + SBOM attestations (`--provenance=false --sbom=false`) so identical source produces a stable digest. Without this the smart-skip in `publishDockerImage` never matched and every dev rebuild reuploaded.
- Dedupe `publishDockerImages` iteration so python/conda → docker autogen entries don't run twice.
- `docker push` failure now wraps the docker error with the `aws ecr-public … | docker login …` recipe.
- `defaults.ts` adds `DEV_DOCKER_REGISTRY` (the default public ECR) and `DOCKER_BUILD_PLATFORM = "linux/amd64"`.
