---
"@milaboratories/computable": patch
---

Fix race condition where HierarchicalWatcher could be garbage collected before awaitChange() promise resolved, causing tests to timeout. Added global registry to pin watchers with pending promises.

