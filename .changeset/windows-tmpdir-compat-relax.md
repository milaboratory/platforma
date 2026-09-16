---
"@platforma-sdk/workflow-tengo": patch
---

The TMPDIR compatibility layer now also works on Windows.

A backend from before the temporary-directory contract has the SDK provide `TMPDIR` itself, through
a wrapper script staged into the working directory. That wrapper is a POSIX shell script, so a
Windows host used to be a hard error telling the user to update the backend — which stopped blocks
that were running fine before the contract existed.

Windows now gets a wrapper of its own: a `.cmd` batch file that creates `<workdir>\.pl\tmp` and sets
`TMPDIR`, `TMP` and `TEMP` to it. `TEMP` is the one the POSIX wrapper has no reason to set and this
one must — Win32 `GetTempPath`, which most native software reaches its temporary directory through,
reads `TMP` then `TEMP` and never `TMPDIR`.

Which wrapper is staged follows the shape that will actually run, not the host: a command in a
container gets the shell script even on a Windows machine, because the container is Linux. Only the
one that runs is written, so no command's identity — and no command's cache — changes on a host that
was already working.

One consequence worth knowing on Windows: the runner already starts every local command through
`cmd.exe /c`, and the batch file forwards its arguments with `%*`, so an argument is parsed by
cmd.exe twice instead of once. A literal `%name%` inside an argument is therefore expanded one more
time than before. Quoted arguments, spaces and `&`, `|`, `>` are unaffected.
