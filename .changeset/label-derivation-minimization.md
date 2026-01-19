---
"@platforma-sdk/model": patch
---

Label derivation algorithm now minimizes the selected type set after finding a working combination. After the greedy selection finds types that produce unique labels, it attempts to remove types one by one (lowest importance first) while preserving label uniqueness. This produces shorter, cleaner labels when the initial selection included redundant types.
