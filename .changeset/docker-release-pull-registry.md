---
"@platforma-sdk/block-tools": patch
---

Fix release docker descriptors embedding the quay push target as the pull address. Release channel now defaults the embedded pull address to the built-in `containers.pl-open.science` registry (the GA-fronted pull proxy), independent of the push target. `PL_RELEASE_DOCKER_PULL_URL` / `PL_DOCKER_REGISTRY` still override. Dev channel is unchanged (pull still follows push, one ECR host).
