---
"@platforma-sdk/workflow-tengo": patch
---

Fix `slices.quickSort` and `slices.quickSortFn` overflowing the Tengo stack on sorted input. The sort used the last element as the pivot, so a sorted list of about 290 elements failed with `index out of range [2048] with length 2048`. `resolveAst` sorts the already sorted input file list of every exec with a resource formula, so a ptabler run with about 283 or more input files failed. The sort now uses Hoare partitioning around the middle element and recurses only into the smaller part, so the recursion depth is at most log2(n).
