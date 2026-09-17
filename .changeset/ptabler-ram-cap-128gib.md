---
"@platforma-sdk/workflow-tengo": patch
---

Raise the default ptabler RAM cap from 64 GiB to 128 GiB.

The default sizing formula is now `ram = between(2 GiB + 4 × size, 2 GiB, 128 GiB)`. The floor, the multiplier, the `4GiB` static fallback and the CPU formula are unchanged, so runs whose input volume keeps them under 64 GiB request exactly what they did before. Only runs that were pinned at the old ceiling — inputs above ~15.5 GiB of stored parquet — ask for more.

Blocks that set an explicit `mem` are unaffected; an explicit request still wins.
