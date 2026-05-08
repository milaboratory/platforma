---
name: monorepo-operations
description: "Quick reference for all pnpm/turbo scripts in the Platforma SDK monorepo: build, do-pack, test, fmt, check, reset, turbo-why, CI variants, and their task dependency graph. Use when you need to run a monorepo command, choose between script variants (e.g. build vs build:local, test vs test:local), understand turbo task ordering, debug cache issues, or clean up build artifacts. Also use when the user mentions building packages, running tests, formatting, linting, or resetting the monorepo."
user-invocable: false
---

# Monorepo Operations

All commands run from the monorepo root (`core/platforma/`).

## Task Dependency Graph

Turbo enforces this execution order — understanding it explains why some commands are slow and what triggers rebuilds:

```
fmt                          (standalone, no deps)
formatter:check              (standalone)
linter:check                 (standalone)
types:check  ← ^build       (needs dependencies built)
build        ← ^build, types:check  (needs deps built + type-checked)
test         ← build        (needs own package built)
do-pack      ← build        (needs own package built)
check        ← ^build       (needs dependencies built)
```

`^build` means "build my dependency packages first". So `build` cascades bottom-up through the dependency tree.

## Build

| Command | What It Does |
|:--------|:-------------|
| `pnpm build` | Build all packages in dependency order. Turbo caches — unchanged packages skip. |
| `pnpm build:local` | Same but with `PL_PKG_DEV=local` — software descriptors point to local filesystem instead of remote registry. Use when testing local software binaries. |
| `pnpm build -- --force` | Rebuild everything, ignoring turbo cache. |
| `pnpm build --filter="@platforma-sdk/model"` | Build a single package (+ its deps). |

**Outputs cached by turbo:** `dist/`, `block-pack/`, `pkg-*.tgz`

### When To Use `build` vs `build:local`

- **`build`** (normal): software descriptors reference the remote registry. For testing workflow/model/UI changes against published software, or for CI.
- **`build:local`**: software descriptors reference local file paths. For testing local software binaries with the desktop app.

## Do-Pack

Creates `package.tgz` archives consumed by blocks and the desktop app.

| Command | What It Does |
|:--------|:-------------|
| `pnpm do-pack` | Pack all packages (builds first if needed). |
| `pnpm do-pack:local` | Pack with `PL_PKG_DEV=local`. |
| `pnpm do-pack --filter="@platforma-sdk/model"` | Pack a single package. |

**When to use:** after making SDK changes that blocks or the desktop app need to consume via `pnpm.overrides`. See the `platforma-dev` skill for the full override workflow.

## Test

| Command | What It Does |
|:--------|:-------------|
| `pnpm test` | Run all tests (concurrency=1, cached). |
| `pnpm test:no-cache` | Force-rerun all tests (adds `--force`). |
| `pnpm test:local` | Tests with `PL_PKG_DEV=local`. |
| `pnpm test:local+no-cache` | Local tests without cache. |
| `pnpm test:local+dry-run` | Dry-run with JSON output — shows what turbo would run without executing. |

**Env vars passed through to tests** (set these when running against a backend instance):
- `PL_ADDRESS` — backend URL (e.g. `http://localhost:6345/`)
- `PL_TEST_USER`, `PL_TEST_PASSWORD` — auth credentials
- `PL_TEST_PROXY`, `PL_TEST_STORAGE_ID` — optional test config
- `DEBUG`, `MI_LICENSE` — debug logging and license

**Single test package:**
```bash
(cd etc/blocks/model-test/test && pnpm test)
```

## Code Quality

| Command | What It Does |
|:--------|:-------------|
| `pnpm fmt` | Format all packages (oxfmt + oxlint --fix). |
| `pnpm check` | Run all checks — types + lint + format (needs build first). |
| `pnpm formatter:check` | Check formatting without fixing. |
| `pnpm linter:check` | Check lint without fixing. |
| `pnpm types:check` | TypeScript type checking (needs deps built). |

**Per-package formatting** (faster for iteration):
```bash
pnpm -C <package-path> fmt    # e.g. pnpm -C sdk/model fmt
```

## Turbo Filters

Pass `--filter` to any turbo-based command to scope it:

```bash
--filter="pkg"       # just the package (deps run via task graph, not added to scope)
--filter="pkg..."    # the package + all its dependencies (what it needs)
--filter="...pkg"    # the package + all its dependents (what needs it)

Examples:
```bash
pnpm build --filter="@platforma-sdk/model"
pnpm do-pack --filter="@platforma-sdk/model" --filter="@platforma-sdk/ui-vue"
pnpm test --filter="@platforma-sdk/test..."
```

## Cache Debugging

| Command | What It Does |
|:--------|:-------------|
| `pnpm turbo-why build` | Analyze why turbo cache missed on a build. Shows root-cause tasks, downstream cascades, hash changes, input file recency, env vars. |
| `pnpm turbo-why test` | Same for test. |

Uses `scripts/turbo-why.mjs` internally. Helpful when a build takes longer than expected — shows what changed and what cascaded.

## Reset / Cleanup

| Command | What It Does |
|:--------|:-------------|
| `pnpm reset` | Full nuclear reset: dist + node_modules + turbo cache. |
| `pnpm reset:dist` | Remove all `dist/` folders (keeps node_modules and cache). |
| `pnpm reset:turbo-cache` | Clear `.turbo/` cache dirs. |
| `pnpm reset:node_modules` | Remove all `node_modules/` dirs. |
| `pnpm reset:etc-blocks` | Clean test block build artifacts only. |

**After `reset`**, you need `pnpm install && pnpm build` to get back to a working state.

## CI Scripts

These are optimized for CI pipelines — errors-only output, turbo-why analysis. You generally don't need these locally.

| Command | What It Does |
|:--------|:-------------|
| `pnpm ci:prepare` | Build ts-builder, check formatting + linting. |
| `pnpm ci:build` | ci:prepare + turbo-why + build (errors only). |
| `pnpm ci:build:local` | ci:build with `PL_PKG_DEV=local`. |
| `pnpm ci:test` | turbo-why + test (errors only). |
| `pnpm ci:test:no-cache` | CI test without cache. |
| `pnpm ci:test:local` | CI test with `PL_PKG_DEV=local`. |
| `pnpm ci:test:local+no-cache` | CI test local, no cache. |

## Versioning

| Command | What It Does |
|:--------|:-------------|
| `pnpm changeset` | Interactive changeset creation. |
| `pnpm version-packages` | Apply changesets — bump versions in package.json files. |

See the `platforma-dev` skill for changeset conventions and PR workflow.

## Git Hooks

The monorepo has husky hooks that run automatically:

| Hook | Runs | Cached | Cold |
|:-----|:-----|:-------|:-----|
| pre-commit | `pnpm fmt` | ~1-2s | ~2-3 min |
| pre-push | `pnpm check` | ~5-10s | ~3-5 min |

Both skip in CI. Use 600s timeout for commit/push commands from Claude Code.

## Requirements

- Node.js >= 22
- pnpm 9.14+
- Optional: oxfmt, oxlint (peer deps)
