---
'@milaboratories/uikit': patch
'@platforma-sdk/ui-vue': patch
---

uikit and ui-vue: get global platforma from preload via hook. Now we could defined a hook and return new platforma that overrides some behaviours. It's needed for keeping old compat
