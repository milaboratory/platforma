---
"@platforma-sdk/workflow-tengo": minor
---

`exec.builder().addFile(name, ref, opts)` and `exec.builder().writeFile(name, data, opts)` (and the plural `addFiles` / `writeFiles`) now accept a `{ writable: true }` option that lands the file as `0o600` in the workdir.

By default the workdir fill rule stays read-only (`0o400`), so the backend hardlinks the entry from the content-addressable archive cache — fast, inode-shared with the archive, immutable. Passing `writable: true` flips the rule to `0o600`, which forces the backend to copy the file to a fresh inode in the workdir, leaving the archive entry untouched. Use it only when the tool legitimately mutates an input in place (rare — usually a sign the tool violates input immutability).

The option propagates one layer down: `workdir.builder().addFile` / `writeFile` (plus plural forms) gained the same `{ writable }` option.

Workflows that don't pass `writable` keep the previous behavior and the same exec CID — the new field is only added to the settings resource when at least one file was marked writable.
