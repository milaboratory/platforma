---
"@platforma-sdk/package-builder-lib": patch
---

The conda Dockerfile retries the yq download instead of hanging up to 15 minutes on one stalled connection.
