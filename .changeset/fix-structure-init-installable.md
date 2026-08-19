---
'@platforma-sdk/block-tools': patch
---

Fix `structure init` so a fresh block installs, passes `pnpm run upgrade-sdk`, packs, and releases at 1.0.0. The catalog now carries `typescript` and `@platforma-sdk/block-kind`, the seeded model no longer declares an unused parameter, every module carries a version (`pnpm pack` cannot resolve a `workspace:*` dep without one) — backfilled by a `structure refresh` too, so a block scaffolded earlier stops failing `do-pack`, and the root gets a `.changeset/` — the config `changeset version` needs, plus an empty changeset so the first release publishes 1.0.0 instead of 1.0.1.

The generated CI workflows now run Node 22, matching the toolchain. A `structure refresh` moves an existing block off Node 20, because the workflow files are engine-owned.
