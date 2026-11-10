---
"@platforma-sdk/block-tools": minor
"@platforma-sdk/package-builder-lib": minor
---

Support Google Cloud Storage as registry storage: `gs://<bucket>/<prefix>` for block publishing and registry maintenance in block-tools, and for software package upload in package-builder. Authentication uses Application Default Credentials.

- block-tools and package-builder now share one storage implementation, exported from package-builder-lib and re-exported by block-tools. The `RegistryStorage` interface gained `exists()` and `checkAccess()`, and `putFile()` accepts a stream; code that implements the interface itself must add them.
- block-tools accepts the same addresses as package-builder: `s3://`, `s3e://`, `s3es://`, `gs://` and local paths. S3 writes go through the multipart uploader, so large and streamed bodies work.
- Every object written to GCS, package archives included, gets `Cache-Control: no-cache`, so a registry served from a public bucket is never stale.
- package-builder checks access inside the target prefix, so credentials scoped to `<bucket>/<prefix>/*` are enough on GCS. On S3 they also need `s3:ListBucket` for that prefix: without it S3 answers 403 instead of 404 for a missing object.
- `s3e://` upload URLs now honour the endpoint, credentials and nested key prefix they carry; `s3es://` is the same over https. The region defaults to `us-east-1` when `?region=` is omitted.
- Registry HTTP reads now fail with the HTTP status instead of parsing an error page as content.
