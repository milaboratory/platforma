---
"@milaboratories/pl-client": minor
"@milaboratories/pl-tree": minor
---

Expose the canonical id of a resource as `BasicResourceData.canonicalId`, and pin with a regression test that a committed pure resource reports a non-empty one.

The field joins `originalResourceId` in the write-once group: empty until the server fills it in, fixed from then on. `pl-tree` carries it through the mirror and guards the same transition, which bumps the persisted-tree schema to 2 — an older snapshot is rejected as `unknown-schema` and refetched, as any schema change is.
