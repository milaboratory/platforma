---
"@milaboratories/pl-model-common": minor
"@platforma-sdk/model": minor
"@platforma-sdk/workflow-tengo": minor
---

Add `pl7.app/linker/alwaysLabel` linker annotation (`Annotation.Linker.AlwaysLabel`, `isLinkerAlwaysLabeled`): columns reached through an opted-in linker always get a "via <link label>" postfix, even when their label is unique. Tengo: `spec.A_LINKER_ALWAYS_LABEL`.
