---
"@milaboratories/milaboratories.monetization-test": patch
"@milaboratories/milaboratories.pool-explorer": patch
"@milaboratories/milaboratories.ui-examples": patch
---

Declare a block kind. Each block gains a `kind/` package holding its init-params
contract, and its model is built with `new DataModelBuilder({ kind })` /
`BlockModelV3.create({ dataModel, kind })` and projects its params back via
`templateParams()`.
