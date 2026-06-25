---
"@platforma-sdk/block-tools": patch
---

Migrate the block-tools CLI framework from oclif to commander. CLI-only, internal change — the full command surface (build-meta, build-model, pack, publish, refresh-registry, mark-stable, update-deps, list-overview-snapshots, restore-overview-from-snapshot, upload-package-v1, and `structure check|init|refresh`), all flags, short flags, env-var bindings, defaults, and exit behavior are preserved. The library exports (`src/lib.ts` / `dist/index.*` / `dist/lib.d.ts`) are unchanged.
