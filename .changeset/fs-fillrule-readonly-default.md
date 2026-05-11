---
"@platforma-sdk/workflow-tengo": minor
---

Workdir fill rules now default to read-only (0o400). The backend hardlinks
the input from its content-addressable archive cache to the workdir
instead of copying — the workdir entry shares the inode with the archive
entry and is immutable.

Three fill-rule shapes change:

- `_getFileFillRule.permissions`: 0o600 → 0o400
- `_getArchiveFillRule.extractRules.filePerms`: 0o600 → 0o400
- `_getValueFillRule.permissions`: 0o600 → 0o400

Workflows that legitimately need a writable copy of an input (rare; it
usually means the tool mutates the input in place, which violates
immutability) should pass `permissions: 0o600` explicitly. The backend
will then copy the file to a fresh inode in the workdir, leaving the
archive entry untouched.

Pairs with the FS-storage honor-request change in pl: `addFileToWorkdir`
takes the hardlink fast path iff the rule's permissions exactly match
the archive entry's canonical mode (0o400). Anything else copies. Old
workflows built against this SDK that did not pass an explicit mode (and
therefore relied on the previous 0o600 default) will land in the copy
branch on upgrade — observable behaviour matches the pre-PR-1810 era for
those flows, with the archive entry safe.
