# Running a local platforma server

Integration tests (both in the platforma monorepo and in standalone blocks) require a running platforma backend.

## Download the server binary

Store the server outside any git repo (e.g., at the workspace root or a dedicated tools directory).

```bash
PL_SERVER_DIR=/path/to/server   # adjust to your layout
mkdir -p "$PL_SERVER_DIR"
```

Download the binary for your platform:

| OS / Arch | URL |
|:----------|:----|
| macOS ARM64 (Apple Silicon) | `https://dl.platforma.bio/software/platforma-backend/pl-macos-arm64.tgz` |
| macOS AMD64 (Intel) | `https://dl.platforma.bio/software/platforma-backend/pl-macos-amd64.tgz` |
| Linux AMD64 | `https://dl.platforma.bio/software/platforma-backend/pl-linux-amd64.tgz` |

```bash
curl -L -o "$PL_SERVER_DIR/pl.tgz" https://dl.platforma.bio/software/platforma-backend/pl-macos-arm64.tgz
cd "$PL_SERVER_DIR" && tar xzf pl.tgz
```

The binary is at `$PL_SERVER_DIR/binaries/platforma`.

## Start the server

The server requires a license key. Set `MI_LICENSE` in your shell environment (e.g., in `~/.zshrc`). The test framework reads this variable automatically.

```bash
PL_SERVER_DIR=/path/to/server
PLATFORMA_ROOT=/path/to/platforma              # path to the platforma monorepo

"$PL_SERVER_DIR/binaries/platforma" \
    --license "$MI_LICENSE" \
    --main-root "$PL_SERVER_DIR/data" \
    --data-library-fs=library="$PLATFORMA_ROOT/assets"
```

Key flags:
- `--license "$MI_LICENSE"` — license from environment
- `--main-root "$PL_SERVER_DIR/data"` — self-contained data directory (database, packages, work dirs)
- `--data-library-fs=library=<path>` — mounts the monorepo's `assets/` directory as a data library (test fixtures live there)

On successful start, the server prints:

```
API  address:  http://127.0.0.1:6345?token=<TOKEN>
```

The token changes on every start. Copy it for use in tests.

## Test environment variables

Tests need these environment variables:

```bash
export PL_ADDRESS=http://127.0.0.1:6345/
export PL_TEST_USER=default
export PL_TEST_PASSWORD=<TOKEN>    # the token from server startup output
```

`MI_LICENSE` must also be set for the server process. The `PL_*` variables above are passed through to test processes via turbo's `passThroughEnv` configuration.

## Stop the server

Press `Ctrl+C` in the terminal where the server is running, or `kill <PID>`.

The data in `$PL_SERVER_DIR/data/` persists between runs. To start fresh, delete the `data/` directory.
