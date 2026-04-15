---
"@platforma-sdk/package-builder": minor
"@platforma-sdk/tengo-builder": patch
---

Add `PL_PKG_DEV=local-rel` (a.k.a. `--dev=local-rel`) build mode. It emits a
path relative to `packageRoot` into the `local.path` field of `.sw.json`
descriptors instead of an absolute one, making descriptors portable across
machines (e.g. Turbo remote cache shared between runners with different
workspace paths). The `tengo-builder` resolves the relative path back to
absolute against the package root when embedding the descriptor into compiled
templates, so the Platforma backend keeps receiving an absolute path.
