---
"@milaboratories/pl-drivers": patch
---

Cache presigned download URLs by signed resource id, avoiding a `GetDownloadURL` round-trip per blob read. Each cache entry's TTL is derived from the expiry encoded in the URL (`X-Amz-*` for S3 / FS-remote, `X-Goog-*` for GCS), minus a 30s safety margin for clock skew; URLs without an encoded expiry (local `storage://`) get a bounded default TTL.

If a cached URL is nonetheless rejected by storage with a 4xx (e.g. an expired signature when clock skew exceeds the safety margin), the entry is evicted and the download is retried once with a freshly fetched URL, instead of failing until the cache entry's TTL lapses.
