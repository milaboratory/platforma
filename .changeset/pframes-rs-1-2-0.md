---
"@milaboratories/pf-driver": patch
"@milaboratories/pl-middle-layer": patch
"@milaboratories/pf-spec": patch
"@platforma-sdk/workflow-tengo": patch
"@platforma-open/milaboratories.software-ptabler": patch
---

Update pframes-rs-node, pframes-rs-wasip2 and polars-pf to 1.2.0. JsonPartitioned parts are sorted by axes on read, so a part written in another key order no longer gives wrong join rows. Same-axes outer joins no longer re-sort. pframes-rs-node requires Node 24. Bump runenv-python-3 to 1.16.1, which bundles polars-pf 1.2.0 for ptabler.
