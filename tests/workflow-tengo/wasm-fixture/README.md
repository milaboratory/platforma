# `@platforma-tests/wasm-table-fixture`

Private workspace package that bundles a small WASI p2 component for the
`workflow-tengo` integration tests. Block-author code consumes it via
`assets.importWasm("@platforma-tests/wasm-table-fixture:main")`.

The component is a copy of `core/pl/controllers/workflow/internal/testassets/table_component.wasm`
(the same fixture used by the pl backend's own unit tests). It exposes:

```
interface demo:tables/api {
  resource table {
    from-json:    static func(spec: string) -> table;
    find-column:  func(sel: string) -> result<string, string>;
    always-panic: static func(msg: string);  // traps with `msg`
  }
}
```

Not built from source here — the wasm bytes are checked in. When the
fixture interface or behaviour needs to change, regenerate it from the
Rust source under `core/pl/support/wasm-test-wasmtime-go-cbind/component/`
and copy `table_component.wasm` here.
