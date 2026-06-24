---
"@milaboratories/pl-model-middle-layer": patch
"@milaboratories/pl-middle-layer": patch
"@platforma-sdk/block-tools": patch
---

Reshape the `from-pack-v2` BlockPointer to a dependency-free URL locator: rename
`folder` → `packUrl` (the block-pack directory) and add optional `rootUrl` (the
facade/package root). Both are `file:` URLs, NOT filesystem paths.

The facade emits the lossless, OS-agnostic locator (`import.meta.url` is always a
forward-slash `file:` URL, even on Windows) by pure string ops with zero imports,
so it stays dependency-free and loadable in minimal engines (e.g. QuickJS). Each
consumer converts at its own edge with `fileURLToPath` (loader, `resolveToRegistry`,
tests), where Windows drive letters / `%`-encoding / UNC are handled correctly; the
watcher cache key uses `packUrl` directly (a stable string). The structurer that
builds a block owns its on-disk layout, so the pointer self-describes where the
pack lives instead of letting consumers reconstruct `<root>/block-pack` — a
consumer at a different SDK version cannot know a layout the structurer may
relocate. `loadPackDescriptionFromManifest` takes the pack directory directly.
`dev-v2` is unchanged (keeps its path-valued `folder`).
