---
"@milaboratories/pl-tree": patch
---

Back off the tree-sync poll interval when a cycle reports no changes, up to a 5s ceiling, instead of re-polling an idle tree at full rate. Any change, or an observer asking for fresh state, resets it immediately.
