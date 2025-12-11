---
"@milaboratories/ts-configs": patch
---

Add `tsconfig.block-model.json` for block model packages. This config is like `tsconfig.node.json` but without requiring `@types/node`, since block models are platform-agnostic TypeScript modules that don't use Node.js APIs.
