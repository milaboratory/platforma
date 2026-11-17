---
"@platforma-open/milaboratories.software-ptabler": patch
"@milaboratories/pf-spec": patch
"@milaboratories/pf-driver": patch
"@milaboratories/pl-middle-layer": patch
"@platforma-sdk/workflow-tengo": patch
"@platforma-sdk/test": patch
---

Update pframes-rs-node, pframes-rs-wasip2 and polars-pf to 1.3.1. pframes-rs-node and polars-pf get fixes for security advisories in the Rust crates arrow, parquet, rustix and zstd. pframes-rs-wasip2 has no functional change. polars-pf also gets the spec engine changes of pframes-rs 1.3.0 (reverse linker traversal, an axis mapping underflow fix), which pframes-rs-wasip2 already has. Bump runenv-python-3 to 1.16.2, which bundles polars-pf 1.3.1 for ptabler.
