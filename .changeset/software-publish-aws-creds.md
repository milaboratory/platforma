---
"@platforma-open/milaboratories.software-ptexter": patch
"@platforma-open/milaboratories.software-ptabler": patch
"@platforma-sdk/block-tools": patch
---

Fix release publishing: declare `AWS_*`/`PL_AWS_*` in the `build`/`do-pack` `passThroughEnv` of the ptexter and ptabler `turbo.json`, and in the structurer's root `turbo.json` template (`build`) so generated block repos get them too. The S3 upload now runs inside the turbo-cached `build` task under strict env mode, which strips any env var not declared in `env`/`passThroughEnv`. The AWS credentials set by CI were being stripped, so the package builder's S3 storage driver could not load credentials and publish failed with "Could not load credentials from any providers". Uses `passThroughEnv` (not `env`) because session tokens rotate per run and must not enter the cache key.
