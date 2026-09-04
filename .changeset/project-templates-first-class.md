---
"@milaboratories/pl-middle-layer": minor
---

Make project templates first-class entities.

A template is now stored in the user's root rather than only exported to a file: the
immutable `template-v1` document lives in an ephemeral resource's data blob, its label and
timestamps in KV, and the whole shelf is listed and watched like the project list.
`saveProjectAsTemplate`, `renameTemplate`, `deleteTemplate`, `getTemplateData`,
`resolveTemplate`, `createProjectFromTemplate` and `shareTemplate` are the new surface.

A template can also travel: `EnvelopePayload` is now a discriminated union
(`{ kind: "projects" }` | `{ kind: "template" }`) and `EnvelopeData.schemaVersion` is 2.
A template share is read-only and writes no `acceptance/{login}` receipt — the recipient
gets the document on their own shelf and decides when to apply it, so there is no
acceptance to report back. A client that does not recognise a payload kind hides that
share rather than mis-rendering it.
