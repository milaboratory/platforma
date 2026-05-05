---
"@platforma-sdk/model": patch
---

Fix `createPlDataTableV3` collapsing linker variants that share axis name + domain. Linked columns are now emitted as nested `linkerJoin` `SpecQueryJoinEntry`s instead of flat sibling leaves under one `outerJoin`, binding each hit column to its own linker chain.
