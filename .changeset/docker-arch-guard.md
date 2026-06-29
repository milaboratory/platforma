---
"@platforma-sdk/package-builder-lib": patch
---

Fail with a clear error when a docker software build targets a non-x64 platform. Docker images are
built as `linux/amd64` only; an explicit `--platform`/target with an `aarch64` arch now errors
naming the constraint instead of silently producing an amd64 image. The CI host skip
(`strictPlatformMatching`) is unaffected.
