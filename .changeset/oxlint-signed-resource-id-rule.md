---
"@milaboratories/ts-builder": minor
"@milaboratories/pl-client": minor
---

Replace custom `as (Signed)?ResourceId` regex check with an oxlint-native rule. Bumps `oxlint` to `1.63.0` and adds `oxlint-plugin-eslint` to ship the ESLint `no-restricted-syntax` rule. The shared `oxlint-node.json` config bans `as SignedResourceId` casts via an AST selector. The pl-client `types.ts` — the canonical place to construct `SignedResourceId` values — opts out with a single file-wide `/* oxlint-disable */` directive, so no per-call suppressions are needed. Pl-client now exports `asSignedResourceId(str)` which validates the `<globalId>|<signatureHex>` format and returns a branded `SignedResourceId`; callers outside `types.ts` must use it instead of casting.
