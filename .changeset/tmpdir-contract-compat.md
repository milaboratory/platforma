---
"@platforma-sdk/workflow-tengo": minor
---

A command that asks for scratch space always gets TMPDIR and TMP, on every backend.

`exec.builder().resources({ onCPU: { scratchFreeSpace: … } })` now guarantees both variables,
pointed at `<workdir>/.pl/tmp` — the same location `{system.scratch.path}` names. A size is still
what decides whether a fast device sits behind that path; `0` asks for the directory alone.

Backends that provide this themselves are used directly. On one that does not, the SDK stages a
small POSIX shell script into the working directory and routes the command through it: the script
creates the directory, exports both variables, and `exec`s the command with its arguments
untouched. `{system.scratch.path}` is rewritten to a workdir-relative path on those backends too,
where the expression would otherwise fail to evaluate at all rather than render empty.

Two consequences worth knowing:

- A block no longer needs to branch on `hasScratchSpace` to arrange its own temporary storage.
- On Windows the workaround cannot run, so an old backend there is refused with an error naming
  the fix. Windows ships only as a built-in backend, whose version is ours to update.
