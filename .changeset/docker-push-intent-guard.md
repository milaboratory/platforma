---
"@platforma-sdk/package-builder-lib": minor
"@platforma-sdk/package-builder": minor
"@platforma-sdk/block-tools": minor
---

Fail CI builds that produce docker images without pushing them. A stray `"private": true` on a software package silently disabled auto-push while the entrypoint descriptor still referenced the image tag, so CI went green and the block 404'd pulling the image at runtime. Opt out with `--docker-no-autopush` when a package really must build images it does not publish.
