---
"@platforma-sdk/model": minor
---

MILAB-6318: add `TreeNodeAccessor.getDataAsJsonOrUndefined<T>()`, a not-ready-safe reader. It returns `undefined` while a resource is still computing instead of throwing "Resource has no content." — the throw `getDataAsJson` raises for a resolved-but-not-yet-fetched blob, which surfaces a transient "Some outputs have errors" banner during calculation on remote backends. A terminal-but-empty resource still throws, matching `getDataAsJson`.
