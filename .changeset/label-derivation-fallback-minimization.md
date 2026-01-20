---
"@platforma-sdk/model": patch
---

Label derivation minimization now also works in fallback/degenerate cases where full label uniqueness cannot be achieved. The algorithm removes types that don't contribute to label diversity (i.e., types whose removal doesn't decrease the number of unique labels), producing shorter labels even when some duplicates are unavoidable.
