---
"@milaboratories/pl-tree": patch
---

Delta resolution rounds ask a shallow walk first: round n of a poll uses
`unconditionalDepth = min(n, 3)` (1, 2, 3, 3, …) instead of a fixed 32, so a poll no longer re-sends
up to 32 levels of subtree the mirror already holds under deduplicated outputs.
