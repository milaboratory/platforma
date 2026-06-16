---
"@milaboratories/pl-drivers": patch
---

Cache presigned download URLs by signed resource id, avoiding a `GetDownloadURL` round-trip per blob read. Each cache entry's TTL is derived from the expiry encoded in the URL (`X-Amz-*` for S3 / FS-remote, `X-Goog-*` for GCS), minus a 30s safety margin for clock skew; URLs without an encoded expiry (local `storage://`) get a bounded default TTL.
