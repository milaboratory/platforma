# @platforma-open/milaboratories.software-ptexter

## 1.2.3

### Patch Changes

- 45706c3: Fix release publishing: declare `AWS_*`/`PL_AWS_*` in the `build`/`do-pack` `passThroughEnv` of the ptexter and ptabler `turbo.json`, and in the structurer's root `turbo.json` template (`build`) so generated block repos get them too. The S3 upload now runs inside the turbo-cached `build` task under strict env mode, which strips any env var not declared in `env`/`passThroughEnv`. The AWS credentials set by CI were being stripped, so the package builder's S3 storage driver could not load credentials and publish failed with "Could not load credentials from any providers". Uses `passThroughEnv` (not `env`) because session tokens rotate per run and must not enter the cache key.
- 25ae090: Fix release publishing: declare `PL_REGISTRY_PLATFORMA_OPEN_UPLOAD_URL` in the `build`/`do-pack` `env` of the ptexter and ptabler `turbo.json`, and in the structurer's root `turbo.json` template (`build` env) so generated block repos get it too. Software upload now runs inside the turbo-cached `build` task under strict env mode, which strips any env var not declared in `env`/`passThroughEnv`. The registry-scoped upload URL set by CI was being stripped, leaving `registry.storageURL` empty and failing publish with "no storage URL is set for registry platforma-open".

## 1.2.2

### Patch Changes

- 79156bc: fix dense axis

## 1.2.1

### Patch Changes

- a6ea24f: silent ci tests

## 1.2.0

### Minor Changes

- 3ef2381: Generelazation filters and annotations

## 1.1.1

### Patch Changes

- d58f182: Use fresh python run environment with bugfix for pip on windows

## 1.1.0

### Minor Changes

- c11e4aa: feat: Package ptabler and ptexter as Docker images

  This change introduces Docker support for the ptabler and ptexter packages, allowing them to be distributed as Docker images. This simplifies deployment and ensures a consistent execution environment.

## 1.0.1

### Patch Changes

- a5a0559: Initial publication
