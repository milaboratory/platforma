---
"@platforma-sdk/blocks-deps-updater": patch
---

`updatePackages` accepts an optional resolver for a package's latest version, so its tests no
longer depend on npmjs.org being reachable and fast.
