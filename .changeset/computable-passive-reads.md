---
"@milaboratories/computable": minor
---

`Computable.awaitChangePassively`, `getValuePassively` and `getValueOrErrorPassively` wait for and read the value without asking the data sources to start or keep refreshing their state, so a reader that only reacts to changes others bring in does not keep a polled source awake.
