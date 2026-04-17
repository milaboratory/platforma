---
"@milaboratories/ts-builder": patch
---

Fix Windows build output with `preserveModules`: the default `external` callback now only runs its classification for unresolved specifiers (`isResolved=false`). Previously, when Rolldown called `external` again with a resolved absolute path, the regex `/^[^./]/` matched Windows drive letters (`D:\...`), flagging local files as external. This caused Rolldown to emit imports with source `.ts` extensions (e.g. `import from "./helper.ts"`), producing bundles that fail at runtime with `ERR_MODULE_NOT_FOUND`. POSIX was unaffected because its absolute paths start with `/`.
