---
'@platforma-sdk/workflow-tengo': minor
---

- Ability to set output cache for pure templates
- `stepCache` parameter for `processColumn`, to set caching to allow deduplication and recovery logic to pick up previous results in quick recalculation scenarious
- Anonymization and deanonymization logic for resource fields and PColumnKeys allows deduplication for calculation depending on things like sample ids that are different in different project, yet the data is the same
- Support of anonymization logic in `processColumns`
