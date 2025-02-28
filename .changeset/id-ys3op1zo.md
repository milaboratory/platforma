---
"@milaboratories/pl-model-backend": patch
"@milaboratories/pl-config": patch
"@milaboratories/pl-client": patch
"@milaboratories/pl-http": patch
"@milaboratories/pl-drivers": patch
"@milaboratories/pl-deployments": patch
"@milaboratories/pl-middle-layer": patch
"@platforma-sdk/ui-vue": patch
"@platforma-sdk/block-tools": patch
"@platforma-sdk/bootstrap": patch
"@platforma-sdk/tengo-builder": patch
"@platforma-sdk/package-builder": patch
"@milaboratories/ui-vue-playground": patch
---

Pin and standardize dependency versions for network and utility libraries to ensure consistent builds and prevent unexpected behavior from minor version changes. Changes include:

- Pin `@protobuf-ts/*` packages to version 2.9.4 using YAML anchors
- Pin AWS SDK packages to version 3.750.0
- Change `undici` from `^7.2.3` to `~7.2.3` (only patch updates)
- Change `@grpc/grpc-js` from `^1.12.6` to `~1.12.6` (only patch updates)
- Change `cacheable-lookup` from `^6.1.0` to `~6.1.0` (only patch updates)
- Change `canonicalize` from `^2.0.0` to `~2.0.0` (only patch updates)
- Pin `quickjs-emscripten` to exact version 0.31.0 