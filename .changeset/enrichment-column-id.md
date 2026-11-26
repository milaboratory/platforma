---
"@milaboratories/pl-model-common": minor
"@platforma-sdk/model": minor
"@platforma-sdk/ui-vue": minor
"@platforma-sdk/workflow-tengo": minor
---

A dataset's enrichment is named by its column id. `DatasetOption.enrichments` and `DatasetSelection.enrichments` hold `{ id, label }` entries (`DatasetEnrichment`), where `id` is the id of the discovered column. `tableBuilder.addColumn` / `addColumns` take a column id — a block output or a discovered column — and `{ id, label }` entries. `EnrichmentRef`, `EnrichmentStep`, `LabeledEnrichmentRef`, `createEnrichmentRef` and `isEnrichmentRef` are removed; `tableBuilder` no longer takes `{ __isEnrichment: "v1" }` maps. A dataset selection saved with enrichments in the old format has to be picked again.
