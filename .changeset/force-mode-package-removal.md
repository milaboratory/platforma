---
"@platforma-sdk/block-tools": minor
---

**Enhanced force mode to support complete package and version removal**

Force mode in the registry now properly handles complete removal of manually deleted packages and versions:

- **Complete rebuild**: Force mode now starts with empty overviews instead of loading existing ones, ensuring overviews exactly match storage contents
- **Automatic cleanup**: Manually deleted packages/versions are automatically removed from registry overviews during force mode refresh
- **Pre-write snapshots**: Added safety feature that creates backup snapshots with `-prewrite-` suffix before making any changes in force mode
- **Comprehensive testing**: Added extensive test coverage for deletion scenarios

**Breaking changes**: None - this enhancement only affects force mode behavior and maintains backward compatibility for normal mode operations.

**Use case**: This resolves the issue where manually deleted packages would persist in registry overviews because the previous force mode only updated packages found in storage. Now force mode performs a complete rebuild, guaranteeing consistency between storage and overviews.
