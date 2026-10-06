---
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-middle-layer": minor
---

A `template-v1` document may carry an optional `label` and `description`, each read trimmed and dropped when blank; `withTemplateMeta` sets or removes them. The middle layer's new `importTemplate` stores a template from a document under the label it is given, taking the document's description as the template's own.
