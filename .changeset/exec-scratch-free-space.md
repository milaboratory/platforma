---
"@platforma-sdk/workflow-tengo": minor
---

Add `scratchFreeSpace` to `exec.builder().resources({ ... })`.

A command can now ask for disposable disk space for its temporary files, in either the `onCPU`
or the `onGPU` block, and the backend points `TMPDIR` at storage sized for the request instead
of the small temporary directory every job shares. Ask for it when a command writes large
intermediate data — sorting, indexing, alignment. The size can be a fixed value or an
`exec.formula` computed from the input data, and the command reads back the location it really
got with `{system.scratch.path}` and the size with `{system.scratch.gib}`.

Scratch space is an optimisation, never a precondition: a deployment that cannot serve the size
caps it, one that has no scratch storage ignores the request, and a scratch formula that cannot
be evaluated drops the request rather than failing the exec — where a `ram` or `cpu` formula
would error. A `.staticFallback(...)` on a scratch formula is inert, since the backends that
would consult it are the same ones that ignore the request altogether.
