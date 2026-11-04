---
"@platforma-sdk/block-tools": minor
"@platforma-sdk/package-builder-lib": minor
---

Support Google Cloud Storage as registry storage: `gs://<bucket>/<prefix>` for block publishing and registry maintenance in block-tools, and for software package upload in package-builder. Authentication uses Application Default Credentials. Registry HTTP reads now fail with the HTTP status instead of parsing an error page as content. `s3e://` upload URLs now honour the endpoint, credentials and nested key prefix they carry.
