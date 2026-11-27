---
"@milaboratories/pl-middle-layer": patch
"@platforma-sdk/block-tools": minor
---

Registry v2 and local dev block packs are prepared without parsing the workflow; it is loaded when the template is cached. block-tools adds `RegistryV2Reader.getManifest`.
