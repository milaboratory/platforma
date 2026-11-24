---
"@milaboratories/pl-middle-layer": minor
---

A block state no longer nests a copy of the project overview, so opening a block runs only its own model lambdas and the title lambdas of the blocks its column links name, not the sections, title, subtitle and tags of every block in the project. Column links are labelled from those titles, the same ones the overview shows, and the project overview can no longer be nested into another computable. With `MI_LOG_BLOCK_STATE_STAT` set, creating a block state logs how long it took and the model VMs it ran by lambda, and each later recalculation is logged too.
