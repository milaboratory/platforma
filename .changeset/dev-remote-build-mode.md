---
"@platforma-sdk/package-builder-lib": minor
---

Add the `dev-remote` build mode: a dev-channel build that builds and uploads a binary
archive (today's `dev-local` skips the archive and emits a same-host `local` descriptor).
The `BuildMode` enum now separates the two axes it conflated — `isDevMode()` (channel: dev
naming + `isDev` marker) and `producesRegistryDescriptor()` (descriptor shape: registry vs
same-host). `dev-local` and `release` are unchanged.

On the dev channel the embedded binary registry name is the built-in `midev`, flipping to
`dev` and routing uploads to the developer's endpoint when `PL_DEV_BINARY_UPLOAD_URL` is set;
`PL_RELEASE_BINARY_UPLOAD_URL` overrides the release upload endpoint without renaming. A
referenced run environment keeps its own published registry. No default dev endpoint URL is
committed — dev remote upload requires the endpoint to be supplied.
