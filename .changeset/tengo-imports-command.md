---
"@platforma-sdk/tengo-builder": minor
"@platforma-sdk/workflow-tengo": patch
---

`pl-tengo imports` replaces the clean-imports shell script.

Unused tengo imports used to be found by a bash script that only `workflow-tengo` could run.
It needed bash, `mapfile` and a GNU-ish `grep` and `awk`, so no block had access to it, and it
read the source with a plain text search. That search had no idea what a comment is, so an
alias left behind in a comment counted as a usage and the import survived. It also had no word
boundary, so `ll` looked used whenever an unrelated `xll.` appeared, and it only looked at
Platforma artifact imports — the whole tengo standard library was invisible to it.

The check now runs inside the builder, on the parser the compiler itself uses. Comments come
back empty from that parser, so an alias mentioned only in a comment is correctly reported as
unused. Every import is checked, the standard library included.

An import counts as used when its alias appears with a dot somewhere else in the code:
`text.split(...)`. A module passed around as a plain value is not recognised as a usage, so
such an import is reported. This is deliberate. Keeping an import the source no longer needs
costs nothing at runtime, while dropping one it does need breaks the build.

The command has three modes. `--check` reports and fails without touching a file, `--fix`
removes the unused imports, and with neither option it fixes the sources for a person and
checks them for CI. CI must report the problem, not make a change nobody reviewed.

A source the parser cannot read is reported and left as it is, while the other sources are
still cleaned and the command exits with an error. One broken source no longer blocks the
cleanup of everything else, and `pl-tengo check` reports the parse problem in full right after.

`workflow-tengo` now calls the command instead of the script, so both `scripts/clean-imports.sh`
and the `scripts/build.sh` wrapper around it are gone.
