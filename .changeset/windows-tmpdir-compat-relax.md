---
"@platforma-sdk/workflow-tengo": patch
---

Windows no longer fails on a backend from before the temporary-directory contract.

The TMPDIR compatibility wrapper is a POSIX shell script, so it cannot run on a Windows host. That
case used to be a hard error naming the backend version to update to. It is now simply skipped: the
command runs unwrapped, exactly as it did before the compatibility layer existed, and only loses
the guarantee that TMPDIR and TMP point into `<workdir>/.pl/tmp`.

A command that runs in a container is still wrapped, whatever the host is — the container is Linux.
Every `system.scratch` expression is still rewritten on such a backend, on Windows too, because
there is no such variable there to render.
