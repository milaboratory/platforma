---
'@milaboratories/pl-middle-layer': minor
---

Significant refactoring of project mutation and project reading logic to support explicit enrichment modelling.
  - separation of computable environment context for quickjs sandbox
  - support of light non-computable functions executin with quickjs sandbox
  - ProjectHelper as a common caching and logic place for block state computations
  - dependency graph construction logic supporting explicit enrichment targeting and enrichment attaching references
