---
"@platforma-sdk/pl-cli": patch
---

Allow `@milaboratories/pframes-rs-node` install script to run under pnpm 10 via `pnpm.onlyBuiltDependencies`. Without this, `pnpm dlx @platforma-sdk/pl-cli` fails at runtime with `MODULE_NOT_FOUND` for the `pframes_rs_node.node` native binary because pnpm 10 blocks dependency install scripts by default.
