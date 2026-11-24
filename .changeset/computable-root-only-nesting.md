---
"@milaboratories/computable": minor
---

A computable made with `nesting: "rootOnly"` can be read and watched on its own, but nesting it into another computable throws. Every parent renders its own copy of a nested computable, so this keeps a costly computable from being rendered again inside each one that embeds it. The default stays `"allowed"`.
