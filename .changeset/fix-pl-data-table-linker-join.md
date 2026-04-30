---
"@platforma-sdk/model": patch
---

Fix `createPlDataTableV3` collapsing linker variants whose intermediate
axes share name + domain. The flat `outerJoin` shape let the engine
pick one linker chain and reuse it for all variants — columns labeled
"X via Linker A" and "X via Linker B" rendered identical values.

`SecondaryGroup` now carries an explicit `{ hit, linkers? }` chain;
linked variants are right-folded into nested `linkerJoin` operations
(outermost-first), binding *this* hit to *this* linker chain so the
engine can no longer collapse them.
