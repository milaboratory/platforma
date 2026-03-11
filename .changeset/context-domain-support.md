---
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-model-middle-layer": minor
"@platforma-sdk/model": minor
"@platforma-sdk/ui-vue": patch
"@platforma-sdk/workflow-tengo": minor
"@platforma-open/milaboratories.software-ptabler": patch
---

Add contextDomain support across the platform

- Add `contextDomain` field to AxisId, AxisSpec, PColumnSpec and related types
- Add `contextDomainAnchor` to AnchoredPColumnSelector with full pack-based optimization in AnchoredIdDeriver
- Extend spec distiller, matchers, xsv-builder, and query resolution to handle contextDomain
- Add contextDomain to discoverColumns API types (MultiColumnSelector, MultiAxisSelector)
- Add feature-flag-gated ContextDomain query predicate in query-anchored template
- Rename `additionalDomains` to `contextDomain` in SpecQueryJoinEntry and AxisQualification
