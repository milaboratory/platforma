---
"@milaboratories/uikit": patch
---

Fix `PlDropdown`, `PlDropdownMulti`, `PlDropdownRef`, and `PlDropdownMultiRef` so that selected values not present in the options list — typically `PlRef`s whose upstream block was deleted — render a friendly italic "Value not available" / "Upstream value removed" label instead of leaking the raw JSON of the value. The multi variants now surface missing entries as styled, closeable chips rather than silently dropping them. New `missingValueLabel` prop on all four components lets callers customize the text.
