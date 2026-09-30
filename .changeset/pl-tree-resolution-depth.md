---
"@milaboratories/pl-tree": patch
---

Delta resolution rounds start with a shallow walk: round n of a poll uses
`unconditionalDepth = min(2^(n-1), 32)` (1, 2, 4, 8, 16, 32, 32, …), so a poll does not re-send
up to 32 levels of subtree the mirror already holds under deduplicated outputs.
