---
"@platforma-sdk/block-tools": minor
---

Declare the `software build` env vars in the block's turbo `build` task. The root `turbo.json`
template now cache-keys the build on `PL_BUILD_CHANNEL`/`PL_BUILD_VARIANT`/`PL_BUILD_LOCATION`/
`PL_BUILD_USE_PUBLISHED` and the `PL_DEV_*`/`PL_RELEASE_*` docker/binary overrides, so a
channel/scenario switch invalidates the cache for every package's build — including the workflow
package that embeds the descriptor. The list is declared once (`softwareBuildCacheEnv`) and a test
guards the template against drift. `PL_PKG_DEV` is retained for the pl-pkg transition.
