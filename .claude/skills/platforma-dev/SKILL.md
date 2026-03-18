---
name: platforma-dev
description: Platforma SDK monorepo development — building packages, do-pack, using local SDK in blocks and desktop app, turbo filters, dev vs normal builds, pnpm overrides workflow, changesets, PRs, running local platforma server for tests.
user-invocable: true
---
# Platforma SDK monorepo development

## Quick reference

| Task | Command | Run from |
|:-----|:--------|:---------|
| Install deps | `pnpm install` | monorepo root |
| Build all | `pnpm build` | monorepo root |
| Build all (dev) | `pnpm build:local` | monorepo root |
| Pack all packages | `pnpm do-pack` | monorepo root |
| Pack single package | `pnpm do-pack --filter="<pkg>"` | monorepo root |
| Reset everything | `pnpm reset` | monorepo root |
| Desktop app dev | `pnpm build && pnpm run dev` | desktop app root |

---

## Building the monorepo

### First-time setup

```bash
pnpm install
pnpm build
```

Node >= 22 required. Package manager: pnpm 9.14+.

### Build commands

`pnpm build` runs `turbo run build`, which compiles every package in dependency order. Turbo caches outputs — unchanged packages are skipped on subsequent builds.

`pnpm do-pack` runs `turbo run do-pack`, which first builds (if needed), then creates `package.tgz` in every package directory. These `.tgz` files are what gets consumed by blocks and the desktop app.

### Selective builds with turbo filters

Build or pack specific packages instead of the full monorepo. Turbo flags like `--filter` pass through from `pnpm do-pack` / `pnpm build`:

```bash
# Pack a single package (and its dependencies)
pnpm do-pack --filter="@platforma-sdk/model"

# Pack a package and all its dependencies
pnpm do-pack --filter="@platforma-sdk/model..."

# Pack a package and everything that depends on it (dependents)
pnpm do-pack --filter="...@platforma-sdk/model"

# Build a specific package only
pnpm build --filter="@platforma-sdk/ui-vue"

# Multiple packages
pnpm do-pack --filter="@platforma-sdk/model" --filter="@platforma-sdk/ui-vue"
```

Filter syntax:
- `--filter="pkg"` — the package + its dependencies
- `--filter="pkg..."` — the package + all its dependencies (what it needs)
- `--filter="...pkg"` — the package + all its dependents (what needs it)

For iteration, pack only what you changed. Example: if you modified `sdk/model/`, run `pnpm do-pack --filter="@platforma-sdk/model"` instead of the full `pnpm do-pack`.

### Force rebuild (bypass cache)

```bash
pnpm build --force                          # rebuild everything
pnpm do-pack --filter="pkg" --force         # force-repack one package
```

### Key packages

| Package | Path | Typical consumers |
|:--------|:-----|:------------------|
| `@platforma-sdk/model` | `sdk/model/` | Block model definitions |
| `@platforma-sdk/ui-vue` | `sdk/ui-vue/` | Block UI (Vue components) |
| `@platforma-sdk/workflow-tengo` | `sdk/workflow-tengo/` | Block workflows (Tengo) |
| `@platforma-sdk/test` | `sdk/test/` | Block test utilities |
| `@milaboratories/uikit` | `lib/ui/uikit/` | Desktop app, block UI |
| `@milaboratories/pl-middle-layer` | `lib/node/pl-middle-layer/` | Desktop app |
| `@milaboratories/pl-model-common` | `lib/model/common/` | Desktop app, blocks |
| `@platforma-sdk/block-tools` | `tools/block-tools/` | Block build tooling |
| `@platforma-sdk/tengo-builder` | `tools/tengo-builder/` | Workflow compilation |
| `@platforma-sdk/package-builder` | `tools/package-builder/` | Software package builds |

---

## Using local SDK packages in blocks

Blocks are separate pnpm workspaces. They pull SDK packages from the npm registry via `catalog:` versions in their `pnpm-workspace.yaml`. To develop with local (unpublished) SDK changes:

### Step 1: Build and pack in the platforma monorepo

```bash
# In the platforma monorepo root
pnpm do-pack             # pack everything
# or selectively:
pnpm do-pack --filter="@platforma-sdk/model" --filter="@platforma-sdk/ui-vue"
```

This creates `package.tgz` files in each package directory (e.g., `sdk/model/package.tgz`).

### Step 2: Add pnpm overrides in the block

In the block's root `package.json`, add (or uncomment) a `pnpm.overrides` section pointing to the `.tgz` files:

```json
{
  "pnpm": {
    "overrides": {
      "@platforma-sdk/model": "file:/path/to/platforma/sdk/model/package.tgz",
      "@platforma-sdk/ui-vue": "file:/path/to/platforma/sdk/ui-vue/package.tgz"
    }
  }
}
```

Use absolute paths or relative paths from the block root (e.g., `file:../../core/platforma/sdk/model/package.tgz`).

**Convention:** Most blocks keep commented-out overrides under `"//pnpm"` or `"//pnpm2"` keys — these are inactive JSON that serve as templates. Copy the structure to a real `"pnpm"` key and update the paths to your local environment.

**Override all changed packages.** If you modified multiple packages in the platforma monorepo, override all of them in the block — not just one. SDK packages have internal dependencies; overriding `@platforma-sdk/model` to a newer version while keeping `@platforma-sdk/ui-vue` at the old registry version causes type mismatches and build failures. The linked trio (`model`, `ui-vue`, `test`) should always be overridden together. Similarly, if you changed `@milaboratories/uikit` alongside `@platforma-sdk/ui-vue`, override both.

### Step 3: Install and build

```bash
pnpm install    # resolves overrides, updates lockfile
pnpm build      # turbo detects lockfile change, rebuilds affected packages
```

No `--force` is needed. When `pnpm install` resolves overrides pointing to local `.tgz` files, the lockfile changes (different integrity hashes). Turbo detects the lockfile change and invalidates the cache automatically.

### Step 4: Iterate

After making more changes in the platforma monorepo:

```bash
# In platforma monorepo — rebuild and repack changed packages
pnpm do-pack --filter="@platforma-sdk/model"

# In the block — reinstall and rebuild
pnpm install    # detects changed tgz content, updates lockfile
pnpm build      # turbo cache invalidated, rebuilds
```

pnpm tracks the integrity hash of `file:` dependencies. When the `.tgz` content changes (even at the same path), `pnpm install` updates the lockfile, and turbo rebuilds.

### Cleanup before committing

Remove (or comment out) the `pnpm.overrides` section and restore the lockfile:

```bash
# Edit package.json: remove or comment out pnpm.overrides
# Then:
pnpm install    # regenerates lockfile without overrides
```

Never commit `pnpm.overrides` pointing to local paths — CI will fail.

---

## Using local SDK packages in the desktop app

The desktop app (`platforma-desktop-app/`) uses **pnpm** with `catalog:` versions in `pnpm-workspace.yaml`, the same pattern as blocks. It consumes platforma SDK packages from the npm registry.

### Step 1: Build and pack in the platforma monorepo

```bash
# In the platforma monorepo root
pnpm do-pack
```

### Step 2: Add pnpm overrides in the desktop app

In the desktop app's root `package.json`, add overrides to the existing `pnpm.overrides` section:

```json
{
  "pnpm": {
    "overrides": {
      "@sentry/core": "10.40.0",
      "jsonfile": "^6.0.1",
      "@platforma-sdk/model": "file:../platforma/sdk/model/package.tgz",
      "@milaboratories/uikit": "file:../platforma/lib/ui/uikit/package.tgz"
    }
  }
}
```

Use relative paths from the desktop app root (e.g., `file:../platforma/sdk/model/package.tgz`). Keep existing overrides (`@sentry/core`, `jsonfile`) in place — only add the packages you're developing.

**Override all changed packages together.** The same rule as for blocks: SDK packages have internal dependencies, so partial overrides cause type mismatches and build failures.

### Step 3: Install and build

```bash
pnpm install    # resolves overrides, updates lockfile
pnpm build      # builds all internal desktop app packages
```

### Step 4: Iterate

```bash
# In platforma monorepo — rebuild and repack
pnpm do-pack --filter="@platforma-sdk/model"

# In desktop app — reinstall and rebuild
pnpm install    # detects changed tgz content, updates lockfile
pnpm build
```

### Running the desktop app in development mode

The desktop app uses Vite + Electron with hot-reload watchers.

#### First-time setup (or after `pnpm clean-build`)

The internal workspace packages (`@platforma/core`, `@platforma/ipc`, etc.) must be built before the dev server can start. The Vite renderer dev server needs `@platforma/core` for dependency pre-bundling at startup.

```bash
cd /path/to/platforma-desktop-app
pnpm install
pnpm build       # build all internal packages — needed once
pnpm run dev     # starts Vite dev server + Electron with hot reload
```

For a faster start, `pnpm --filter=@platforma/core run build` is the minimum needed before `pnpm run dev`. The watch script builds the remaining packages automatically.

#### Subsequent runs

`pnpm run dev` is sufficient — the watch script rebuilds internal packages on change.

#### Running from Claude Code

`pnpm run dev` is a long-running process (Vite dev server + Electron). Run it as a background task:

```
Bash tool:
  command: "cd /path/to/platforma-desktop-app && pnpm run dev 2>&1"
  run_in_background: true
```

This returns a task ID. Use:
- `TaskOutput` (with `block: false`) to read logs
- `TaskStop` to terminate the app cleanly (kills both Vite and Electron)

Do NOT append `&` to the command — `run_in_background` handles backgrounding. Adding `&` causes the shell to exit immediately, orphaning the Electron process with no way to read logs or stop it.

### Cleanup before committing

Reset `package.json` and `pnpm-lock.yaml` to their original state:

```bash
git checkout -- package.json pnpm-lock.yaml
pnpm install
```

Never commit `pnpm.overrides` pointing to local paths.

---

## Normal build vs dev build

The difference applies to **software packages** — binary tools (MiXCR, ptexter, etc.) that run on the platform backend.

### Normal build (`pnpm build`)

Software descriptors (`sw.json`) reference the **remote registry** using the version from `package.json`. The platform downloads the published software from the registry at runtime.

Use normal build when:
- You only changed **workflow**, **model**, or **UI** code (not the underlying software)
- You want to test on a **remote server** — the server pulls published software versions
- The published software version matches what you need

### Dev build (`pnpm build:dev` / `PL_PKG_DEV=local`)

Software descriptors reference **local file paths**. The platform loads software from the local filesystem.

Use dev build when:
- You changed the software itself and need to test locally
- You need to run with the **desktop app** using local software binaries

In the platforma monorepo:
```bash
pnpm build:local          # same as PL_PKG_DEV=local pnpm build
pnpm do-pack:local        # same as PL_PKG_DEV=local pnpm do-pack
```

In blocks:
```bash
pnpm build:dev            # same as env PL_PKG_DEV=local turbo run build
```

The block's `turbo.json` includes `PL_PKG_DEV` in the build task's `env` array, so turbo invalidates the cache when switching between normal and dev modes.

---

## Running a local platforma server for tests

For server download, startup, and environment variables, see [local-server.md](./local-server.md).

### Run monorepo tests

With the server running and env vars set:

```bash
cd /path/to/platforma

# Run a specific test package
(cd etc/blocks/model-test/test && pnpm test)

# Or use turbo to run all tests
pnpm test:local
```

`pnpm test:local` sets `PL_PKG_DEV=local` and runs all tests via turbo.

---

## Changesets and PRs

Every PR to the platforma monorepo **must** include a changeset. Without it, no version bump or release happens.

### Creating a changeset

Add a markdown file in `.changeset/` (use any kebab-case name):

```markdown
---
"@platforma-sdk/model": minor
"@platforma-sdk/ui-vue": minor
---

Type-safe `usePlugin` composable with `PluginHandle` branded type.
```

The YAML frontmatter lists affected packages with bump type (`patch` / `minor` / `major`). The body is a human-readable description of the change.

### CRITICAL: list every modified package

The changeset must include **every package whose source files changed in the PR** — not just the "primary" package. If a PR adds a new tool but also adds exports to `pl-middle-layer`, both packages need entries in the changeset. Without an entry, the package won't get a version bump and npm consumers will get the old version without the new exports.

**Verification step:** Before creating the changeset, run `git diff --name-only origin/main...HEAD` and check which `package.json` directories have modified files. Each one needs an entry.

### Package naming

Use the full npm package name (including scope):
- `"@platforma-sdk/model"`, `"@platforma-sdk/ui-vue"`, `"@platforma-sdk/test"`
- `"@milaboratories/uikit"`, `"@milaboratories/pl-middle-layer"`, etc.
- `"@milaboratories/build-configs"`, `"@milaboratories/ts-builder"`, etc.

### Linked packages

`@platforma-sdk/model`, `@platforma-sdk/ui-vue`, and `@platforma-sdk/test` are **linked** in the changeset config. When one bumps, the others bump together. Internal dependency updates propagate as `patch`.

### Empty changesets

If a PR has no user-facing changes (CI fixes, internal refactors), use an empty changeset:

```markdown
---
---
```

### Examples

Bug fix in one package:
```markdown
---
"@milaboratories/pl-model-common": patch
---

Version bump
```

Feature spanning multiple packages:
```markdown
---
"@milaboratories/build-configs": minor
"@milaboratories/uikit": patch
"@platforma-sdk/ui-vue": patch
---

Replace css-injected-by-js with lib-inject-css for per-component CSS imports
```

### Pre-commit checklist

After `pnpm install && pnpm build`, **before committing**, run `git status` and verify:

1. **No unstaged changes remain.** Every modified file must be either staged or intentionally excluded. If `pnpm install` modified `pnpm-lock.yaml`, it must be committed.
2. **`pnpm-lock.yaml` is included** whenever `pnpm-workspace.yaml` changed. CI rejects PRs without matching lock file updates.
3. **Changeset file is included.** Every PR needs one in `.changeset/`.
4. **Changeset covers all modified packages.** Run `git diff --name-only origin/main...HEAD` and verify every package with changed source files has an entry in the changeset. Missing entries mean no version bump — npm consumers get stale code.
5. **After pushing**, run `git diff --name-only origin/main..HEAD` to confirm the PR contains exactly the files you expect.

---

## Troubleshooting

### Build fails with missing binaries (`rolldown`, `oxfmt`, etc.)

Run `pnpm install` — dev dependencies with CLI binaries may need to be installed.

### Turbo uses stale cache after changing overrides

This should not happen. `pnpm install` changes the lockfile when overrides change, which invalidates turbo cache. If it does happen, use `--force`:

```bash
pnpm build --force
```

### Block build fails after adding overrides for only some packages

Override **all related packages** together. SDK packages have internal dependencies — overriding `@platforma-sdk/model` to a newer version while keeping `@platforma-sdk/ui-vue` at the old version causes type mismatches. Override the linked trio (`model`, `ui-vue`, `test`) together.

### `pnpm install` warns about unmet peer dependencies

Expected when mixing SDK versions. The warnings are usually safe to ignore during local development. Address them if the build fails.

---

## Common workflows

### Developing an SDK feature and testing in a block

```bash
# 1. Make changes in platforma monorepo (e.g., sdk/model/src/)

# 2. Build and pack the changed packages (and anything they depend on)
cd /path/to/platforma
pnpm do-pack --filter="@platforma-sdk/model" --filter="@platforma-sdk/ui-vue" --filter="@platforma-sdk/test"

# 3. Set up overrides in the block's package.json for ALL changed packages
#    (add pnpm.overrides section, see above)

# 4. Install and build the block
cd /path/to/my-block
pnpm install
pnpm build

# 5. Test the block (use desktop app with devBlocksPaths setting)

# 6. Iterate: change code in platforma -> do-pack -> pnpm install in block -> pnpm build
```

### Testing SDK changes in the desktop app

```bash
# 1. Build and pack in platforma monorepo
cd /path/to/platforma
pnpm do-pack

# 2. Add pnpm.overrides in desktop app's package.json for ALL changed packages
cd /path/to/platforma-desktop-app
#    (edit package.json — add overrides to pnpm.overrides section, see above)

# 3. Install and build
pnpm install
pnpm build

# 4. Run the desktop app (use run_in_background from Claude Code — see dev mode section above)
pnpm run dev

# 5. Iterate: change code -> do-pack -> pnpm install in desktop app -> pnpm build -> restart dev
#    (stop previous pnpm run dev with TaskStop before restarting)

# 6. Cleanup before committing
git checkout -- package.json pnpm-lock.yaml
pnpm install
```

### Running integration tests locally

Start the platforma server and set env vars (see [local-server.md](./local-server.md)), then:

```bash
cd /path/to/platforma

# Single test package:
(cd etc/blocks/model-test/test && pnpm test)

# All tests:
pnpm test:local
```
