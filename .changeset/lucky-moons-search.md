---
"@platforma-sdk/workflow-tengo": patch
---

Raise the ptabler memory cap from 64 to 128 GiB

`pt.workflow()` sizes its run from the input volume when the block sets no explicit memory:

    ram = clamp(2 GiB + 4 x size, 2 GiB, 128 GiB)

The cap was 64 GiB, which applies to any input above 15.5 GiB. Above that point the request
stops tracking the input, and the step gets the same 64 GiB whatever its size. The floor,
the coefficient and the CPU rule do not change.

A block that sets an explicit `.mem()` is not affected. The cap applies only to the default
formula.
