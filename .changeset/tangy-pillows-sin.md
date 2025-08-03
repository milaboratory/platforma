---
'@milaboratories/pl-drivers': minor
---

Fix file corruption issue in upload client by preventing connection reuse

- **CRITICAL**: Add `reset: true` to prevent connection reuse and fix data corruption where HTTP/1.1 protocol lines were being included in uploaded file content with backend's built-in S3 implementation
- Automatically add Content-Length header if not present in upload requests
- Validate existing Content-Length header values match expected chunk size
- Add assertion to verify read chunk size matches expected content length
