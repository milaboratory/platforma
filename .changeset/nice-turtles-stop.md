---
'@milaboratories/pl-model-common': minor
'@platforma-sdk/model': minor
---

Explicit enrichment tracking in model and refs:
  - requireEnrichments flag added to PlRef
  - enriches lambda added to model builder
  - ctx.getOptions(...) now allows to create options with references requiring enrichments
  - helper methods to create PlRef's and to manipulate requireEnrichments flag
