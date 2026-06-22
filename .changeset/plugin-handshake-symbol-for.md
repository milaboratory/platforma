---
"@platforma-sdk/model": patch
---

Make the plugin↔block handshake symbol (`CREATE_PLUGIN_MODEL`) a global registry symbol (`Symbol.for`) instead of a unique `Symbol(...)`, so it stays identical across multiple copies of `@platforma-sdk/model` in one process. Fixes `instance[CREATE_PLUGIN_MODEL] is not a function` when a block registers a plugin defined in a separate package (e.g. `@milaboratories/graph-maker`) — the plugin instance and the consuming block could otherwise resolve different module copies (bundled vs externalized in `block-tools build-model`, pnpm peer-hash duplicates) and the handshake would miss.
