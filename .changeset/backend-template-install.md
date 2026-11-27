---
"@milaboratories/pl-middle-layer": minor
"@milaboratories/pl-client": patch
---

When the backend supports `templateInstall:v1`, it installs block workflows from a platform Blob: registry packs via `BlobImportExternal`, dev packs uploaded via `BlobUpload`. The client-side path stays as a deprecated fallback (also forced by MI_DISABLE_TEMPLATE_INSTALL).
