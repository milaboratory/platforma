---
'@platforma-sdk/block-tools': patch
---

Added --unstable flag to publish command to control stable channel assignment. When --unstable flag is not set (default behavior), published packages are automatically added to the stable channel. When --unstable flag is set, packages are published without being added to the stable channel. Also added PL_PUBLISH_UNSTABLE environment variable support.

Added gzipped version of global overview file. The registry now creates both the regular overview.json file and a compressed overview.json.gz file with identical content to improve download performance.
