---
"@platforma-sdk/tengo-builder": patch
"@platforma-sdk/workflow-tengo": minor
---

MILAB-6145: per-call memory-cap override on `assets.importWasm`.

- `assets.importWasm(name, opts?)` — new optional `opts` argument. Today
  `opts.memoryLimit` (bytes) overrides the install-time per-instance
  memory cap for just this sandbox; backend silently clamps to
  `[16 MiB, 64 MiB]`. Omit `opts` (or omit the option) to keep the
  install-time default (32 MiB unless the WasmV1 resource was created
  with a different value).
- `pl-tengo` regex/substitution now passes multi-arg `import*` calls
  through untouched. Previously the substitution rewrote
  `assets.importWasm("name", opts)` into `assets.importWasm("normalized") opts)`
  — a syntax error. Single-arg call sites are unchanged.

Tengo parser quirk worth knowing: `assets.importWasm("name", { ... })`
inline trips a parse error around `{`. Hoist the opts map into a local
first:

```go
opts := { memoryLimit: 50 * 1024 * 1024 }
api := assets.importWasm("name", opts)["iface"]
```
