---
"@milaboratories/pl-middle-layer": patch
"@platforma-sdk/test": patch
---

Fix driver kit dispose: actually invoke driver `[Symbol.asyncDispose]()` instead of collecting function references
