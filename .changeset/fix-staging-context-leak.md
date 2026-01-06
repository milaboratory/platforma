---
'@milaboratories/pl-middle-layer': minor
---

Fix staging context cleanup when stopping blocks

When a block's production run is stopped, all downstream staging contexts are now properly cleaned up. This fixes a resource leak that prevented processes from terminating when pressing the "Stop" button.

Additionally, staging context behavior was changed: staging contexts now use input contexts instead of output contexts, meaning staging workflow results stay local to the block and don't propagate to downstream blocks as dependencies. The staging UI context (used by Result Pool in desktop) continues to use workflow output contexts.

