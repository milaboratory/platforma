---
"@platforma-sdk/workflow-tengo": patch
---

Stop the temporary-directory wrapper when it cannot make the directory.

The wrapper made `<workdir>/.pl/tmp`, exported TMPDIR at it and then ran the command regardless of whether the directory was there. A failed mkdir left the command running against a TMPDIR that does not exist, and whatever it wrote temporarily failed later, far from the cause. The POSIX wrapper now runs under `set -eu`; the batch wrapper, where cmd.exe has no equivalent, checks the directory again and exits 1 when it is absent.
