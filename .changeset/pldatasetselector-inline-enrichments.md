---
"@platforma-sdk/ui-vue": patch
---

`PlDatasetSelector`: carry `enrichments` inside the dropdown `Selection`
value so `onChange` no longer needs a separate `findOption` lookup over
`props.options`.
