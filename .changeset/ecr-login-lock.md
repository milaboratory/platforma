---
"@platforma-sdk/block-tools": patch
---

Fix concurrent `docker login` race during parallel software builds: serialize the ECR login
across processes with a cross-process file lock, avoiding the macOS keychain -25299 error.
