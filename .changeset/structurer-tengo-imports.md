---
"@platforma-sdk/block-tools": minor
---

The workflow `check` script now drops unused tengo imports.

A block's `check` runs `pl-tengo imports && pl-tengo check`. The first command finds the
imports the tengo sources do not use: it fixes them for a person and reports them for CI,
which keeps a change nobody reviewed out of a CI run.

The command belongs to `check` and not to `build`. The build task declares every tracked file
as its input, so a command that rewrites sources inside it would change the inputs turbo has
already hashed, and the cached result would belong to a tree that no longer exists. `check` is
a task of its own that the build already depends on, so the sources are clean and stable by
the time the build reads them.

The builder version a block uses needs no change here: `@platforma-sdk/tengo-builder` is
resolved to the latest release on `init` and on `refresh --update-deps-only`, so `pnpm
upgrade-sdk` brings both the new builder and this script.
