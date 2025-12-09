---
'@milaboratories/uikit': patch
'@platforma-sdk/ui-vue': minor
---

Fix PlDropdown showing loading spinner when disabled

When a PlDropdown is both disabled and has undefined options, it no longer shows a loading spinner. The disabled state now takes precedence over the loading state, preventing misleading UX where users think they need to wait when they actually need to interact with another control first.
