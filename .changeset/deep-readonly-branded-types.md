---
"@milaboratories/helpers": patch
---

Fix `DeepReadonly` / `DeepMutable` mangling branded primitive types. The old `keyof T extends never` guard treated a branded string (`string & { [__brand] }`) as an object and mapped over its prototype keys, destroying the brand. The new implementation checks `Primitive | AnyFunction` first (branded primitives and functions pass through untouched), then recurses only into `object` types, leaving `unknown` and other non-object types intact. Union types are now handled correctly too.
