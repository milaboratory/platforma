---
"@milaboratories/uikit": minor
---

Fix `PlDropdown`, `PlDropdownMulti`, `PlDropdownRef`, and `PlDropdownMultiRef`: selected values missing from the options list — typically `PlRef`s whose upstream block was deleted — now render an italic "Value not available" / "Upstream value removed" label instead of leaking the raw value. Multi variants surface missing entries as closeable chips instead of dropping them. All four components accept a `missingValueLabel` prop for custom text.
