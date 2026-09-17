---
"@milaboratories/pl-client": minor
---

Sync the plapi protocol with the delta tree contract and add the `treeChangedSince:v1`
capability token. `Tree.Request` gains `unconditional_depth`, `traverse_stop_rules` is
deprecated in favour of `changed_since_token`, and the retired `resource_unchanged` frame
flag is gone.
