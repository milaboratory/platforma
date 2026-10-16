---
"@milaboratories/columns-collection-driver": patch
"@milaboratories/pl-middle-layer": patch
"@milaboratories/pl-model-common": patch
"@platforma-sdk/model": patch
---

Skip a field that holds an error and no value in column lookups (`ColumnsCollection`, column providers, host `resolveSpec`). One failed output no longer makes every column lookup throw.

- An enumeration skips a column whose spec holds an error. A direct lookup of that column still throws the real error.
- A direct lookup of a column under an errored output field (not an errored spec) now reports the column as absent or not found, not the original error. The block outputs error still shows it.
- The SDK column providers no longer throw on an unset spec of a locked PFrame. They skip the column. The host `ColumnsCollection` keeps listing such a column until its spec resolves.
- The host fixes need this `pl-middle-layer` in the desktop app. The sandbox fixes need the block rebuilt with this `@platforma-sdk/model`.
