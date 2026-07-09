---
"@platforma-open/milaboratories.software-ptexter": patch
"@platforma-open/milaboratories.software-ptabler": patch
"@platforma-sdk/block-tools": patch
---

Fix release publishing: declare `PL_REGISTRY_PLATFORMA_OPEN_UPLOAD_URL` in the `build`/`do-pack` `env` of the ptexter and ptabler `turbo.json`, and in the structurer's root `turbo.json` template (`build` env) so generated block repos get it too. Software upload now runs inside the turbo-cached `build` task under strict env mode, which strips any env var not declared in `env`/`passThroughEnv`. The registry-scoped upload URL set by CI was being stripped, leaving `registry.storageURL` empty and failing publish with "no storage URL is set for registry platforma-open".
