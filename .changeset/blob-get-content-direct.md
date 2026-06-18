---
"@milaboratories/pl-drivers": minor
"@milaboratories/pl-middle-layer": patch
---

Add `DownloadDriver.getContentDirect(handle, options?)` — same result as `getContent`, but it never reads from or writes to the ranges cache (a fresh read straight from storage that does not populate the cache). For local handles it is identical to `getContent`, since local content never uses the ranges cache.

The PFrames data-source blob reader (`pl-middle-layer` pool driver) now uses `getContentDirect`, since PFrames manages its own caching and should not populate the ranges cache.
