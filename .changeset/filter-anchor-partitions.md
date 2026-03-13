---
"@platforma-sdk/model": minor
---

Add `filterToAnchorPartitions` option to `getAnchoredPColumns`. When set, restricts each returned column's visible axis-0 key range to the partition keys present in the resolved anchor column(s) by injecting a `pl7.app/axisKeys/0` annotation onto the returned column specs.
