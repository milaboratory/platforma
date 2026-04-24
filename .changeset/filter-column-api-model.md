---
"@platforma-sdk/model": minor
---

Add filter discovery helpers: `findFilterColumns` for subset column matching, `filterMatchesToOptions` for converting matches to labeled options, and `buildRefMap` for PObjectId→PlRef lookup. Fix `wrapOutputs` Proxy to skip symbol keys and non-existent keys, preventing crashes when the proxy crosses `await` boundaries.
