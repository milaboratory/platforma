---
"@milaboratories/pl-middle-layer": patch
---

Fix block update/staging crash when a block's `args()` returns `undefined`.

When updating a block pack (`update-block-pack`) or deriving initial storage, the middle layer re-ran the new model's `args()` and wrote the result to `currentArgs` unconditionally as long as derivation didn't throw. A model that legitimately returns `undefined` from `args()` (the standard "inputs incomplete/invalid" contract, e.g. `if (!Valid.safeParse(data).success) return undefined`) produced `undefined` with no error, and `createJsonFieldValue(undefined)` threw `ERR_INVALID_ARG_TYPE` (`Buffer.from(undefined)`), aborting the update. Now an `undefined` value is treated like a derivation failure: `currentArgs` is cleared and the update completes, matching the existing behaviour in `initializeBlock`.
