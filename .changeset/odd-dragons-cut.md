---
'@milaboratories/pl-drivers': minor
---

**BREAKING**: Refactor download methods to lambda-based pattern for better resource management

- `RemoteFileDownloader.download()` → `withContent<T>()`
- `ClientDownload.downloadBlob()` → `withBlobContent<T>()`  
- `ClientDownload.readLocalFile()` → `withLocalFileContent<T>()`
- Replace `fromBytes`/`toBytes` params with unified `RangeBytes` interface
- Automatic stream cleanup on all error paths including handler errors
- Centralized error handling prevents resource leaks
