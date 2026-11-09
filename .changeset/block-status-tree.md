---
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/pl-middle-layer": minor
---

Add `watchBlockStatusTree`: the live action-context tree of a block run with per-context state, readings and subtree counters plus the heaviest branches, built from the same per-context folds as the summary. A context's children are present only while it is expanded via `setBlockStatusTreeExpanded`.
