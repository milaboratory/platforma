---
"@milaboratories/pl-tree": patch
---

Delta resolution rounds ask a shallow walk first: round n of a poll uses
`unconditionalDepth = min(2^(n-1), 32)` (1, 2, 4, 8, 16, 32, 32, …) instead of a fixed 32, so a poll no longer re-sends
up to 32 levels of subtree the mirror already holds under deduplicated outputs.
