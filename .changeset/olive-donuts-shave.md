---
"@milaboratories/uikit": patch
---

Fix `required` and `clearable` ignoring valueless attributes on PlTextField and PlNumberField

`<PlTextField required />` had no effect: neither the required marker nor the "Value is required"
check fired. A valueless attribute compiles to the empty string, and Vue coerces that to `true`
only when the prop's declared runtime type includes `Boolean` — but the SFC compiler cannot resolve
a bare type parameter, so `required?: R` emitted a typeless `required: {}` and the prop stayed
`""`. `clearable` hit the same rule from the other side: its conditional type erased the boolean
arm, leaving `{ type: Function }`, so a valueless `clearable` warned and did nothing.

Both props now intersect with `boolean`, which the compiler can resolve, restoring
`{ type: Boolean }` and `{ type: [Boolean, Function] }`. The type-level guard that forbids
`clearable` alongside `required` is unchanged.
