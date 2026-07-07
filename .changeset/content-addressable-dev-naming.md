---
"@platforma-sdk/package-builder-lib": patch
---

Content-addressable dev artifact naming. In a non-release build, `artifactVersion()`
now appends a short content hash (`-<12 hex>`) to the artifact version — the single
point that feeds both the registry upload path and the `.sw.json` `package` field — so
a rebuilt-but-changed dev artifact gets a new name and can never collide with a stale
one. Release stays version-derived; docker is unchanged (already content-addressed via
its image-ID tag). The hash is over relative paths + file contents with directory
entries sorted, so identical content yields the same name regardless of build location
or host. `hashDirSync` now sorts directory entries and recurses under the full relative
path (fixing a `dirA/` vs `dirA/file` collision) for that determinism. This changes the
hash algorithm, so existing dev-local `local.hash` values and dev version suffixes shift
on the next rebuild (dev-only; release is unaffected). Also affects `--full-dir-hash`
local descriptor hashes, which become stable across hosts.
