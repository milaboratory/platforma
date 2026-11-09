---
"@platforma-sdk/block-tools": minor
"@platforma-sdk/package-builder-lib": minor
---

Support Google Cloud Storage as registry storage: `gs://<bucket>/<prefix>` for block publishing and registry maintenance in block-tools, and for software package upload in package-builder. Authentication uses Application Default Credentials.

- block-tools and package-builder now share one storage implementation, exported from package-builder-lib and re-exported by block-tools. The `RegistryStorage` interface gained `exists()` and `checkAccess()`, and `putFile()` accepts a stream; code that implements the interface itself must add them.
- `s3e://` upload URLs now honour the endpoint, credentials and nested key prefix they carry; `s3es://` is the same over https.
- Registry HTTP reads now fail with the HTTP status instead of parsing an error page as content.
