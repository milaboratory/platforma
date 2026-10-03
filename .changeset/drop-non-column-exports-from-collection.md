---
"@milaboratories/pl-model-common": patch
---

Fix column enumeration so an upstream export whose spec is not a PColumn spec is skipped. A block that exports a `kind: "File"` object, such as a custom MiXCR library, no longer reaches column predicates and crashes them on a missing `axesSpec`.
