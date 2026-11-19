---
"@milaboratories/pl-middle-layer": minor
"@milaboratories/pl-client": patch
"@platforma-sdk/block-tools": minor
---

Blocks from an http(s) block registry are installed by the backend when it supports it: the client reads the registry manifest instead of downloading and parsing the workflow. Dev blocks, older backends and any failed install use the client-side path. MI_DISABLE_TEMPLATE_INSTALL turns it off. block-tools: `RegistryV2Reader.getManifest`.
