---
'@milaboratories/ts-helpers': patch
---

Improve atomic file creation with random suffixes

- Enhanced `createPathAtomically()` to use random suffixes for temporary files
- Prevents race conditions when multiple processes create files concurrently
- Added proper cleanup of temporary files on errors
- Uses crypto.randomBytes() for unique temporary file names 