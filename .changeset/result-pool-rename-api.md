---
"@platforma-sdk/model": minor
"@milaboratories/pl-middle-layer": minor
"@milaboratories/pf-driver": patch
---

Rename Result Pool API in render context for clarity. Method names now match what they actually return.

New names (no `FromResultPool` postfix):

- `getPObjectCollection()` — was `getDataFromResultPool()`
- `getPObjectCollectionWithErrors()` — was `getDataWithErrorsFromResultPool()`
- `getPObjectSpecCollection()` — was `getSpecsFromResultPool()`
- `getPObjectByRef()` — was `getPObjectFromResultPoolByRef()`
- `getPObjectSpecByRef()` — was `getSpecFromResultPoolByRef()`
- `getPObjectDataByRef()` — returns only the accessor handle (not a `PObject` wrapper). Replaces the dual-purpose `getDataFromResultPoolByRef()`.
- `getPObjectStatusByRef()` — replaces `getColumnStatusFromResultPoolByRef()`.

Old names remain exported and injected into the render context as `@deprecated` aliases — backward compatibility is preserved.

Internal `ResultPool` cleanup:

- `getDataByRef()` now returns `PlTreeNodeAccessor | undefined` instead of a `PObject` wrapper.
- `getDataOrErrorByRef()` now returns `ValueOrError<PlTreeNodeAccessor, Error> | undefined` and is the source of truth — `getPObjectOrErrorByRef()` delegates to it and adds spec/id on top.

Migration: update calls to the new names. Old names will be removed after 2026-06-01.
