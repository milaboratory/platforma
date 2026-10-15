# What is it for?

The purpose of this package is to keep primitives and functions, that have to be shared between all our execution contexts:

- node
- quickjs sandbox
- browser
- browser preload

We have code that can work in a single specific context (like UI of the block) or in a mixture of contexts.

This package is a meeting point for code that can exist in all possible places.

- NEVER put context-dependent code here. This may (and probably will) ruin the build in some other place (i.e. Desktop App).
- Keep list of dependencies limited and clear. Each new dependency is a moment to think wether you really need it.
