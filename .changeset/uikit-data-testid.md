---
"@milaboratories/uikit": patch
"@platforma-sdk/ui-vue": patch
---

Components render default `data-testid` anchors for E2E tests: `pl-<component>` on the root and `pl-<component>-<part>` on inner parts (inputs, options, buttons, titles, chart marks, …). A `data-testid` passed by the caller replaces the root one. PlFileInput now has a single root (its file dialog moved inside), so attributes passed to it are no longer dropped.
