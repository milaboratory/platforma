---
'@platforma-sdk/model': minor
---

Major block config structure upgrade, simplifies future structure upgrades.
New model features:
  - retentive outputs
  - calculated block `title`
  - initial `uiState`
  - new config lambda context methods:
    - `mapFields` and `allFieldsResolved` for tree node accessor
    - native `getDataByRef` and `getSpecByRef`
