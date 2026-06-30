---
"@milaboratories/milaboratories.ui-examples": minor
"@milaboratories/milaboratories.test-enter-numbers": minor
---

Publish the new-shape facades for two in-monorepo test blocks so a real
published version (carrying `BlockPointer` / `from-pack-v2`, slim deps) exists on
the registry. `test-enter-numbers` had `private: true` removed so it can publish
for the first time; `ui-examples` was already public but its latest published
tarball still ships the pre-facade boilerplate shape, so this republishes it in
the new shape.

This enables the testing-framework self-verification route to pnpm-alias an older
published version of these blocks beside the workspace version.
