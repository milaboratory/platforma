---
"@platforma-sdk/model": patch
---

Fix `evaluateRules` discarding every display rule when one selector matches
nothing. A rule whose selector hits zero columns is now skipped instead of
aborting the whole evaluation, so the remaining `displayOptions.ordering` /
`displayOptions.visibility` rules still apply.
