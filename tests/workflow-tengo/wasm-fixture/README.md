# `@platforma-tests/wasm-table-fixture`

Private workspace package that bundles a small WASI p2 component for the
`workflow-tengo` integration tests. Block-author code consumes it via
`assets.importWasm("@platforma-tests/wasm-table-fixture:main")`.

The `.wasm` binary in this directory is a **derived artifact**, not the
source of truth. It is built from the Rust + WIT source in the
`milaboratory/pl` repo at `fixtures/wasm-test-fixture/`. The same
component is consumed by the backend's own Go unit tests so the bytes
must stay in lockstep — both consumers carry an identical `.wasm`.

## WIT Surface (Summary)

```
interface demo:tables/api {
  resource table {
    from-json:      static func(spec: string) -> result<table, string>;
    find-column:    func(sel: string) -> result<string, string>;
    always-panic:   static func(msg: string) -> string;  // traps
    consume-memory: static func(bytes-decimal: string) -> string;
    spin-millis:    static func(millis-decimal: string) -> string;
    echo-bytes:     static func(bytes-decimal: string) -> string;
    column-count:   func() -> string;
  }
}
```

See `fixtures/wasm-test-fixture/README.md` in the `pl` repo for the
canonical interface, build instructions, and the reason numeric
arguments travel as decimal strings.

## Refreshing the Binary

Run [`sync-wasm-fixture.sh`](sync-wasm-fixture.sh) in this directory.
The script defaults to a shallow clone of `pl@main`, builds the fixture
there, and copies the artifact next to itself. For local-workspace
iteration, point it at a checked-out tree:

```bash
FIXTURE_DIR=/path/to/pl/fixtures/wasm-test-fixture \
  ./sync-wasm-fixture.sh
```

Override `SYNC_ORIGIN_REF=my-branch` to pull from a non-main branch.
