---
"@platforma-open/milaboratories.software-ptexter": patch
"@platforma-open/milaboratories.software-ptabler": patch
---

Fix release publishing: declare `PL_REGISTRY_PLATFORMA_OPEN_UPLOAD_URL` in the `build`/`do-pack` `env` of the ptexter and ptabler `turbo.json`. Since software upload now runs inside the turbo-cached `build` task (strict env mode), the registry-scoped upload URL set by CI was being stripped, leaving `registry.storageURL` empty and failing the publish job with "no storage URL is set for registry platforma-open".
