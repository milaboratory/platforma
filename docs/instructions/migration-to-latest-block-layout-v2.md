# Migration to Latest Block Layout

## Overview

This document provides instructions for migrating Platforma blocks to the latest layout. The latest layout uses `@milaboratories/ts-builder` and `@milaboratories/ts-configs` for building TypeScript/Vue components, replacing the previous `tsup` + `vite` setup.

**Gold standard reference:** `mixcr-clonotyping` block

**Validation:** After migration, run `pnpm install && pnpm run build && pnpm run test` to verify success.

---

## Key Principles

1. **No `tsup`** — All model building uses `ts-builder`
2. **No direct `vite`** — No vite in submodule dependencies; `ts-builder` uses vite internally
3. **Exact SDK versions** — `@platforma-sdk/*` and `@milaboratories/*` packages use exact versions (no `^` or `~`)
4. **Shared TypeScript configs** — All tsconfig.json files extend from `@milaboratories/ts-configs/block/*`
5. **Block-specific targets** — Use `block-model`, `block-ui`, `block-test` targets (not generic ones like `browser`)
6. **No `.prettierrc`** — Prettier config is legacy; use `ts-builder format` (oxfmt) instead
7. **No legacy scripts folder** — Remove `scripts/update-sdk-packages.js` if present
8. **No `eslint` command directly** — Use `ts-builder lint` which runs oxlint under the hood
9. **Oxlint/Oxfmt configs** — Each package needs `.oxlintrc.json` and `.oxfmtrc.json` configuration files

---

## Identifying Old Layout Patterns

Your block likely needs migration if you see any of these patterns:

### Root Level

- `package.json` has `name` field
- `package.json` has `pretty` script
- `package.json` uses `pl-blocks-deps-updater` instead of `block-tools update-deps`
- `package.json` missing `lint`, `type-check`, `do-pack` scripts
- `pnpm-workspace.yaml` has `tsup`, `vite`, `vue-tsc`, `@vitejs/plugin-vue`, `vite-plugin-dts`
- `pnpm-workspace.yaml` has `@platforma-sdk/blocks-deps-updater`
- `pnpm-workspace.yaml` SDK packages use `^` or `~` prefixes
- `turbo.json` has `build:dev` task
- `turbo.json` missing `lint` and `type-check` tasks
- `.prettierrc` file exists
- `scripts/update-sdk-packages.js` exists

### Model Package

- Uses `tsup` + `vite build` or just `vite build`
- Has `main: dist/index.cjs` and `module: dist/index.js` (dual format)
- Has inline `tsup` config in package.json
- Has `vite.config.mts` file
- Missing `watch`, `type-check` scripts
- `tsconfig.json` doesn't extend `@milaboratories/ts-configs/block/model`
- Uses `eslint .` instead of `ts-builder lint`
- Missing `.oxlintrc.json` and `.oxfmtrc.json` configuration files

### UI Package

- Uses `vite` directly with `vue-tsc`
- Has `vite.config.ts`, `tsconfig.app.json`, `tsconfig.node.json`
- `package.json` has `vite`, `vue-tsc`, `@vitejs/plugin-vue` in devDependencies
- Uses `--target browser` instead of `--target block-ui`
- Missing `type-check` script
- Uses `eslint .` instead of `ts-builder lint`
- Missing `.oxlintrc.json` and `.oxfmtrc.json` configuration files

### Workflow Package

- Has `index.js` and `index.d.ts` files in root (not in dist/)
- Missing `lint`, `type-check`, `do-pack` scripts
- `tsconfig.json` doesn't extend ts-configs
- Uses `eslint .` instead of `ts-builder lint`
- Missing `.oxlintrc.json` and `.oxfmtrc.json` configuration files

### Test Package

- Uses `tsc --noEmit` instead of `ts-builder types --target block-test`
- Missing `lint`, `type-check` scripts
- Missing eslint.config.mjs
- Uses `eslint .` instead of `ts-builder lint`
- Missing `.oxlintrc.json` and `.oxfmtrc.json` configuration files

---

## Target State: File-by-File Reference

### Root Level

#### `package.json`

```json
{
  "scripts": {
    "build": "turbo run build",
    "build:dev": "env PL_PKG_DEV=local turbo run build",
    "lint": "turbo run lint",
    "type-check": "turbo run type-check",
    "test": "env PL_PKG_DEV=local turbo run test --concurrency 1 --env-mode=loose",
    "test:dry-run": "env PL_PKG_DEV=local turbo run test --dry-run=json",
    "mark-stable": "turbo run mark-stable",
    "do-pack": "turbo run do-pack",
    "watch": "turbo watch build",
    "changeset": "changeset",
    "version-packages": "changeset version",
    "update-sdk": "block-tools update-deps"
  },
  "devDependencies": {
    "@changesets/cli": "catalog:",
    "@platforma-sdk/block-tools": "catalog:",
    "turbo": "catalog:",
    "typescript": "catalog:"
  },
  "packageManager": "pnpm@9.12.0"
}
```

**Key changes:**

- No `name` field
- No `pretty` script
- Uses `block-tools update-deps` (not `pl-blocks-deps-updater`)
- Has `lint`, `type-check`, `do-pack` scripts
- Scripts use `env PL_PKG_DEV=local` prefix
- No `@platforma-sdk/blocks-deps-updater`

#### `pnpm-workspace.yaml`

```yaml
packages:
  - workflow
  - model
  - ui
  - block
  - test
  # Add software if present:
  # - software

catalog:
  # SDK packages - EXACT VERSIONS (no ^ or ~)
  "@milaboratories/ts-builder": 1.2.1
  "@milaboratories/ts-configs": 1.2.0
  "@platforma-sdk/workflow-tengo": 5.7.3
  "@platforma-sdk/model": 1.48.4
  "@platforma-sdk/ui-vue": 1.48.8
  "@platforma-sdk/tengo-builder": 2.4.2
  "@platforma-sdk/package-builder": 3.10.7
  "@platforma-sdk/block-tools": 2.6.27
  "@platforma-sdk/eslint-config": 1.2.0
  "@platforma-sdk/test": 1.48.8
  "@milaboratories/helpers": 1.12.1

  # Common dependencies - can use ^ or ~
  "vue": ^3.5.24
  "typescript": ~5.6.3
  "turbo": ^2.6.3
  "vitest": ^4.0.7
  "eslint": ^9.25.1
  "@changesets/cli": ^2.29.8

  # Block-specific dependencies as needed
```

**Critical:**

- SDK packages (`@platforma-sdk/*`, `@milaboratories/*`) MUST use exact versions
- No `tsup`, `vite`, `vue-tsc`, `@vitejs/plugin-vue`, `vite-plugin-dts`
- No `@platforma-sdk/blocks-deps-updater`

#### `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["tsconfig.json"],
  "tasks": {
    "lint": {
      "outputs": [],
      "dependsOn": ["^build"]
    },
    "type-check": {
      "outputs": [],
      "dependsOn": ["^build"]
    },
    "build": {
      "inputs": ["$TURBO_DEFAULT$"],
      "env": ["PL_PKG_DEV"],
      "outputs": ["./dist/**", "./block-pack/**", "./pkg-*.tgz"],
      "dependsOn": ["type-check", "lint", "^build"]
    },
    "do-pack": {
      "dependsOn": ["build"],
      "outputs": ["package.tgz"]
    },
    "test": {
      "dependsOn": ["build"],
      "passThroughEnv": [
        "PL_ADDRESS",
        "PL_TEST_PASSWORD",
        "PL_TEST_USER",
        "PL_TEST_PROXY",
        "DEBUG"
      ]
    },
    "mark-stable": {
      "passThroughEnv": ["PL_REGISTRY", "AWS_*"],
      "cache": false
    }
  }
}
```

**Key changes:**

- Has `lint` and `type-check` tasks
- Build depends on `type-check`, `lint`, AND `^build`
- No `build:dev` task (handled by env var in root script)

#### `.gitignore`

```gitignore
node_modules/
dist/
block-pack/
dev/
work/
log/
*.tgz
.test_auth.json
test-dry-run.json
.turbo
vite.config.*.timestamp-*
.DS_Store
/.idea
```

#### `.npmrc`

```
@milaboratories:registry=https://registry.npmjs.org/
@platforma-sdk:registry=https://registry.npmjs.org/
@platforma-open:registry=https://registry.npmjs.org/
```

#### Files to DELETE

- `.prettierrc`
- `scripts/update-sdk-packages.js` (and empty `scripts/` folder)

---

### Model Package (`model/`)

#### `model/package.json`

```json
{
  "name": "@platforma-open/ORGANIZATION.BLOCK-NAME.model",
  "version": "X.Y.Z",
  "description": "Block model",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "sources": "./src/index.ts",
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./dist/*": "./dist/*"
  },
  "scripts": {
    "fmt": "ts-builder format",
    "lint": "ts-builder lint",
    "watch": "ts-builder build --target block-model --watch",
    "build": "ts-builder build --target block-model && block-tools build-model",
    "type-check": "ts-builder types --target block-model",
    "test": "vitest --run --passWithNoTests",
    "do-pack": "rm -f *.tgz && pnpm pack && mv *.tgz package.tgz"
  },
  "dependencies": {
    "@platforma-sdk/model": "catalog:"
  },
  "devDependencies": {
    "@milaboratories/ts-builder": "catalog:",
    "@milaboratories/ts-configs": "catalog:",
    "@platforma-sdk/block-tools": "catalog:",
    "vitest": "catalog:",
    "typescript": "catalog:"
  }
}
```

**Key changes:**

- Has `exports` field with `sources` for IDE resolution
- `main` is `dist/index.js` only (ESM, no dual CJS/ESM)
- No `module` field
- Build uses `ts-builder build --target block-model`
- Has `watch`, `type-check` scripts
- No `tsup`, `vite` in devDependencies
- `lint` uses `ts-builder lint` (oxlint under the hood), no `eslint` dependency needed
- `fmt` uses `ts-builder format` (oxfmt under the hood)

#### `model/tsconfig.json`, `model/.oxlintrc.json`, `model/.oxfmtrc.json`

Generated by `npx ts-builder init-configs --target block-model`.

#### `model/eslint.config.mjs` (LEGACY - delete)

Delete this file. The `ts-builder lint` command uses oxlint with `.oxlintrc.json` instead.

#### `model/vitest.config.mts`

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    watch: false,
  },
});
```

**Note:** The test script includes `--run --passWithNoTests` flags. Vitest 4.x exits with an error when no test files are found; `--passWithNoTests` allows the script to succeed even when tests haven't been added yet.

#### Files to DELETE from model/

- `vite.config.mts` or `vite.config.ts`
- Any inline `tsup` configuration in package.json
- `eslint.config.mjs` (replaced by `.oxlintrc.json`)
- `.prettierrc` (replaced by `.oxfmtrc.json`)

---

### UI Package (`ui/`)

#### `ui/package.json`

```json
{
  "name": "@platforma-open/ORGANIZATION.BLOCK-NAME.ui",
  "version": "X.Y.Z",
  "type": "module",
  "scripts": {
    "dev": "ts-builder serve --target block-ui",
    "watch": "ts-builder build --target block-ui --watch",
    "build": "ts-builder build --target block-ui",
    "type-check": "ts-builder types --target block-ui",
    "fmt": "ts-builder format",
    "lint": "ts-builder lint",
    "do-pack": "rm -f *.tgz && pnpm pack && mv *.tgz package.tgz"
  },
  "dependencies": {
    "@platforma-open/ORGANIZATION.BLOCK-NAME.model": "workspace:*",
    "@platforma-sdk/ui-vue": "catalog:",
    "vue": "catalog:"
  },
  "devDependencies": {
    "@milaboratories/ts-builder": "catalog:",
    "@milaboratories/ts-configs": "catalog:",
    "vitest": "catalog:",
    "typescript": "catalog:"
  }
}
```

**Key changes:**

- Uses `--target block-ui` (not `--target browser`)
- `vue` is in dependencies (not devDependencies)
- No `vite`, `vue-tsc`, `@vitejs/plugin-vue`
- `lint` uses `ts-builder lint` (oxlint under the hood), no `eslint` dependency needed
- `fmt` uses `ts-builder format` (oxfmt under the hood)

#### `ui/tsconfig.json`, `ui/.oxlintrc.json`, `ui/.oxfmtrc.json`

Generated by `npx ts-builder init-configs --target block-ui`.

#### `ui/eslint.config.mjs` (LEGACY - delete)

Delete this file. The `ts-builder lint` command uses oxlint with `.oxlintrc.json` instead.

#### `ui/vitest.config.mts`

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    watch: false,
  },
});
```

#### Files to DELETE from ui/

- `vite.config.ts`
- `tsconfig.app.json`
- `tsconfig.node.json`
- `eslint.config.mjs` (replaced by `.oxlintrc.json`)
- `.prettierrc` (replaced by `.oxfmtrc.json`)

---

### Workflow Package (`workflow/`)

#### `workflow/package.json`

```json
{
  "name": "@platforma-open/ORGANIZATION.BLOCK-NAME.workflow",
  "version": "X.Y.Z",
  "description": "Tengo-based template",
  "scripts": {
    "build": "rm -rf dist && pl-tengo check && pl-tengo build",
    "format": "/usr/bin/env emacs --script ./format.el",
    "test": "vitest",
    "fmt": "ts-builder format",
    "lint": "ts-builder lint",
    "type-check": "ts-builder types --target block-test",
    "do-pack": "rm -f *.tgz && pnpm pack && mv *.tgz package.tgz"
  },
  "dependencies": {
    "@platforma-sdk/workflow-tengo": "catalog:"
  },
  "devDependencies": {
    "@milaboratories/ts-builder": "catalog:",
    "@milaboratories/ts-configs": "catalog:",
    "@platforma-sdk/tengo-builder": "catalog:",
    "@platforma-sdk/model": "catalog:",
    "@platforma-sdk/test": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

**Note:** `type-check` uses `--target block-test` because TypeScript in workflow is for tests only.

#### `workflow/tsconfig.json`, `workflow/.oxlintrc.json`, `workflow/.oxfmtrc.json`

Generated by `npx ts-builder init-configs --target block-test`.

**Note:** Workflow packages use `block-test` target because TypeScript in workflow is for tests only.

#### `workflow/eslint.config.mjs` (LEGACY - delete)

Delete this file.

#### `workflow/vitest.config.mts`

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    watch: false,
    maxConcurrency: 3,
    testTimeout: 10000,
    retry: 2,
  },
});
```

#### Files to DELETE from workflow/

- `index.js` (in root, not dist/)
- `index.d.ts` (in root, not dist/)
- `eslint.config.mjs` (replaced by `.oxlintrc.json`)
- `.prettierrc` (replaced by `.oxfmtrc.json`)

---

### Test Package (`test/`)

#### `test/package.json`

```json
{
  "name": "@platforma-open/ORGANIZATION.BLOCK-NAME.test",
  "private": true,
  "version": "X.Y.Z",
  "description": "Block tests",
  "scripts": {
    "fmt": "ts-builder format",
    "lint": "ts-builder lint",
    "test": "vitest --run --passWithNoTests",
    "type-check": "ts-builder types --target block-test"
  },
  "files": [],
  "keywords": [],
  "dependencies": {
    "this-block": "workspace:@platforma-open/ORGANIZATION.BLOCK-NAME@*",
    "@platforma-open/ORGANIZATION.BLOCK-NAME.model": "workspace:*",
    "@platforma-sdk/model": "catalog:"
  },
  "devDependencies": {
    "@milaboratories/ts-builder": "catalog:",
    "@milaboratories/ts-configs": "catalog:",
    "@platforma-sdk/test": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

**Key changes:**

- Uses `ts-builder types --target block-test` (not `tsc --noEmit`)
- `lint` uses `ts-builder lint` (oxlint under the hood), no `eslint` dependency needed
- `fmt` uses `ts-builder format` (oxfmt under the hood)

#### `test/tsconfig.json`, `test/.oxlintrc.json`, `test/.oxfmtrc.json`

Generated by `npx ts-builder init-configs --target block-test`.

#### `test/eslint.config.mjs` (LEGACY - delete)

Delete this file.

#### `test/vitest.config.mts`

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    watch: false,
    testTimeout: 10000,
    retry: 2,
  },
});
```

#### Files to DELETE from test/

- `eslint.config.mjs` (replaced by `.oxlintrc.json`)
- `.prettierrc` (replaced by `.oxfmtrc.json`)

---

### Block Package (`block/`)

#### `block/package.json`

```json
{
  "name": "@platforma-open/ORGANIZATION.BLOCK-NAME",
  "version": "X.Y.Z",
  "scripts": {
    "build": "rm -rf ./block-pack && block-tools pack",
    "mark-stable": "block-tools mark-stable -r 's3://milab-euce1-prod-pkgs-s3-block-registry/pub/releases/?region=eu-central-1'",
    "prepublishOnly": "block-tools pack && block-tools publish -r 's3://milab-euce1-prod-pkgs-s3-block-registry/pub/releases/?region=eu-central-1'",
    "do-pack": "rm -f *.tgz && block-tools pack && pnpm pack && mv *.tgz package.tgz"
  },
  "files": ["index.d.ts", "index.js"],
  "dependencies": {
    "@platforma-open/ORGANIZATION.BLOCK-NAME.workflow": "workspace:*",
    "@platforma-open/ORGANIZATION.BLOCK-NAME.model": "workspace:*",
    "@platforma-open/ORGANIZATION.BLOCK-NAME.ui": "workspace:*"
  },
  "block": {
    "components": {
      "workflow": "@platforma-open/ORGANIZATION.BLOCK-NAME.workflow/dist/tengo/tpl/main.plj.gz",
      "model": "@platforma-open/ORGANIZATION.BLOCK-NAME.model/dist/model.json",
      "ui": "@platforma-open/ORGANIZATION.BLOCK-NAME.ui/dist"
    },
    "meta": {
      "title": "Block Title",
      "logo": "file:../logos/block-logo.png",
      "url": "https://github.com/platforma-open/BLOCK-REPO",
      "support": "mailto:support@milaboratories.com",
      "description": "Short description",
      "longDescription": "file:../docs/description.md",
      "changelog": "file:./CHANGELOG.md",
      "tags": ["tag1", "tag2"],
      "organization": {
        "name": "MiLaboratories Inc",
        "url": "https://milaboratories.com/",
        "logo": "file:../logos/organization-logo.png"
      }
    }
  },
  "devDependencies": {
    "@platforma-sdk/block-tools": "catalog:"
  }
}
```

**Key changes:**

- Has `do-pack` script
- No `pretty` script
- No `packageManager` field (only in root)

#### `block/index.d.ts`

```typescript
import { BlockPackDescriptionAbsolute } from "@platforma-sdk/block-tools";

declare function loadBlockDescription(): BlockPackDescriptionAbsolute;
declare const blockSpec: {
  type: "dev-v2";
  folder: string;
};

export { loadBlockDescription, blockSpec };
```

#### `block/index.js`

```javascript
const blockTools = require("@platforma-sdk/block-tools");

async function loadBlockDescription() {
  return await blockTools.loadPackDescriptionFromSource(__dirname);
}

const blockSpec = {
  type: "dev-v2",
  folder: __dirname,
};

module.exports = {
  blockSpec,
  loadBlockDescription,
};
```

---

### Software Packages (if present)

Software packages do not require migration. Keep the existing structure:

```json
{
  "name": "@platforma-open/ORGANIZATION.BLOCK-NAME.software",
  "version": "X.Y.Z",
  "scripts": {
    "build": "pl-pkg build",
    "prepublishOnly": "pl-pkg prepublish",
    "do-pack": "rm -f *.tgz && pl-pkg build && pnpm pack && mv platforma-open*.tgz package.tgz"
  },
  "devDependencies": {
    "@platforma-sdk/package-builder": "catalog:"
  },
  "block-software": {
    // ... existing configuration
  }
}
```

---

### Changeset Configuration (`.changeset/`)

#### `.changeset/config.json`

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.2/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "restricted",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": []
}
```

---

### GitHub CI Workflows

#### `.github/workflows/build.yaml`

```yaml
name: Build, Test and Release Platforma Block
on:
  merge_group:
  pull_request:
    types: [opened, reopened, synchronize]
    branches:
      - "main"
  push:
    branches:
      - "main"
  workflow_dispatch: {}
jobs:
  init:
    runs-on: ubuntu-latest
    steps:
      - uses: milaboratory/github-ci/actions/context/init@v4
        with:
          version-canonize: false
          branch-versioning: main
  run:
    needs:
      - init
    uses: milaboratory/github-ci/.github/workflows/node-simple-pnpm.yaml@v4
    with:
      app-name: "Block: BLOCK-TITLE"
      app-name-slug: "block-BLOCK-SLUG"
      node-version: "20.x"
      build-script-name: "build"
      pnpm-recursive-build: false

      test: true
      test-script-name: "test"
      pnpm-recursive-tests: false
      team-id: "ciplopen-TEAM-ID"
      pl-docker-tag: "1.41.8"

      publish-to-public: "true"
      package-path: "block"
      create-tag: "true"

      npmrc-config: |
        {
          "registries": {
            "https://registry.npmjs.org/": {
              "scopes": ["milaboratories", "platforma-sdk", "platforma-open"],
              "tokenVar": "NPMJS_TOKEN"
            }
          }
        }
    secrets:
      env: |
        { "PL_LICENSE": ${{ toJSON(secrets.MI_LICENSE) }},
          "MI_LICENSE": ${{ toJSON(secrets.MI_LICENSE) }},
          "NPMJS_TOKEN": ${{ toJSON(secrets.NPMJS_TOKEN) }},
          "PL_CI_TEST_USER": ${{ toJSON(secrets.PL_CI_TEST_USER) }},
          "PL_CI_TEST_PASSWORD": ${{ toJSON(secrets.PL_CI_TEST_PASSWORD) }},

          "AWS_CI_IAM_MONOREPO_SIMPLE_ROLE": ${{ toJSON(secrets.AWS_CI_IAM_MONOREPO_SIMPLE_ROLE) }},
          "AWS_CI_TURBOREPO_S3_BUCKET": ${{ toJSON(secrets.AWS_CI_TURBOREPO_S3_BUCKET) }},
          "PL_REGISTRY_PLATFORMA_OPEN_UPLOAD_URL": ${{ toJSON(secrets.PL_REGISTRY_PLOPEN_UPLOAD_URL) }},
          "QUAY_USERNAME": ${{ toJSON(secrets.QUAY_USERNAME) }},
          "QUAY_ROBOT_TOKEN": ${{ toJSON(secrets.QUAY_ROBOT_TOKEN) }} }

      SLACK_CHANNEL: ${{ secrets.SLACK_BLOCKS_CI_CHANNEL }}
      SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}

      GH_ZEN_APP_ID: ${{ secrets.GH_ZEN_APP_ID }}
      GH_ZEN_APP_PRIVATE_KEY: ${{ secrets.GH_ZEN_APP_PRIVATE_KEY }}
```

#### `.github/workflows/mark-stable.yaml`

```yaml
name: Mark Platforma Block as Stable
on:
  workflow_dispatch: {}
jobs:
  init:
    runs-on: ubuntu-latest
    steps:
      - uses: milaboratory/github-ci/actions/context/init@v4
        with:
          version-canonize: false
          branch-versioning: main
  run:
    needs:
      - init
    uses: milaboratory/github-ci/.github/workflows/block-mark-stable.yaml@v4
    with:
      app-name: "Block: BLOCK-TITLE - Mark Stable"
      node-version: "20.x"
      npmrc-config: |
        {
          "registries": {
            "https://registry.npmjs.org/": {
              "scopes": ["milaboratories", "platforma-sdk", "platforma-open"],
              "tokenVar": "NPMJS_TOKEN"
            }
          }
        }
    secrets:
      env: |
        { "NPMJS_TOKEN": ${{ toJSON(secrets.NPMJS_TOKEN) }},
          "AWS_CI_IAM_MONOREPO_SIMPLE_ROLE": ${{ toJSON(secrets.AWS_CI_IAM_MONOREPO_SIMPLE_ROLE) }} }

      SLACK_CHANNEL: ${{ secrets.SLACK_BLOCKS_CI_CHANNEL }}
      SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
```

---

## Migration Steps

### Step 1: Update Root Configuration

1. **Update `package.json`:**

   - Remove `name` field if present
   - Remove `pretty` script
   - Change `update-sdk` to use `block-tools update-deps`
   - Add `lint`, `type-check`, `do-pack` scripts
   - Replace `@platforma-sdk/blocks-deps-updater` with `@platforma-sdk/block-tools`
   - Ensure `typescript` is in devDependencies

2. **Update `pnpm-workspace.yaml`:**

   - Add `@milaboratories/ts-builder` and `@milaboratories/ts-configs`
   - Remove `^` and `~` from all SDK package versions
   - Remove `tsup`, `vite`, `vue-tsc`, `@vitejs/plugin-vue`, `vite-plugin-dts`
   - Remove `@platforma-sdk/blocks-deps-updater`
   - Update `vitest` to `^4.0.7`

3. **Update `turbo.json`:**

   - Add `lint` and `type-check` task configurations
   - Update `build` to depend on `type-check`, `lint`, `^build`
   - Remove `build:dev` task if present

4. **Delete files:**
   - `.prettierrc`
   - `scripts/update-sdk-packages.js` (and empty `scripts/` folder)

### Step 2: Migrate Model Package

1. **Update `model/package.json`:**

   - Add `exports` field with `sources`
   - Change `main` to `dist/index.js` (remove `module` field)
   - Change build script to `ts-builder build --target block-model && block-tools build-model`
   - Add `fmt`, `watch`, `type-check` scripts
   - Change `lint` to `ts-builder lint`
   - Add `fmt` script: `ts-builder format`
   - Remove `tsup`, `vite`, `vite-plugin-dts`, `eslint`, `@platforma-sdk/eslint-config` from devDependencies
   - Add `@milaboratories/ts-builder`, `@milaboratories/ts-configs`, `vitest`
   - Remove inline `tsup` configuration

2. **Generate configs:** delete existing `tsconfig.json` and run `npx ts-builder init-configs --target block-model` (creates tsconfig.json, build config, .oxlintrc.json, .oxfmtrc.json)

3. **Ensure `model/vitest.config.mts`** exists

4. **Delete:**
   - `model/vite.config.mts` or `model/vite.config.ts`
   - `model/eslint.config.mjs`
   - `model/.prettierrc`

### Step 3: Migrate UI Package

1. **Update `ui/package.json`:**

   - Change `dev` to `ts-builder serve --target block-ui`
   - Change `build` to `ts-builder build --target block-ui`
   - Change `watch` to `ts-builder build --target block-ui --watch`
   - Add `type-check` script using `--target block-ui`
   - Change `lint` to `ts-builder lint`
   - Add `fmt` script: `ts-builder format`
   - Move `vue` to dependencies (not devDependencies)
   - Remove `vite`, `vue-tsc`, `@vitejs/plugin-vue`, `eslint`, `@platforma-sdk/eslint-config` from devDependencies
   - Add `@milaboratories/ts-builder`, `@milaboratories/ts-configs`, `vitest`

2. **Generate configs:** delete existing `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` and run `npx ts-builder init-configs --target block-ui` (creates tsconfig.json, build config, serve config, .oxlintrc.json, .oxfmtrc.json)

3. **Ensure `ui/vitest.config.mts`** exists

4. **Delete:**
   - `ui/vite.config.ts`
   - `ui/tsconfig.app.json`
   - `ui/tsconfig.node.json`
   - `ui/eslint.config.mjs`
   - `ui/.prettierrc`

### Step 4: Migrate Workflow Package

**Important:** Workflow packages contain only Tengo templates and do NOT need TypeScript/testing infrastructure.

1. **Update `workflow/package.json`:**

   - Keep only `build`, `format`, and `do-pack` scripts
   - Remove `test`, `lint`, `type-check` scripts if present
   - Keep only minimal devDependencies: `@platforma-sdk/tengo-builder` (and other non-TypeScript tools)
   - Remove ALL TypeScript-related dependencies: `@milaboratories/ts-builder`, `@milaboratories/ts-configs`, `@platforma-sdk/eslint-config`, `eslint`, `typescript`, `vitest`, `@platforma-sdk/test`, `@platforma-sdk/model`

2. **Delete ALL TypeScript/testing configuration files:**

   - `tsconfig.json`
   - `eslint.config.mjs`
   - `vitest.config.mts`

3. **Delete from workflow root (not dist/):**
   - `index.js`
   - `index.d.ts`

**Example minimal workflow package.json:**

```json
{
  "name": "@platforma-open/ORGANIZATION.BLOCK-NAME.workflow",
  "version": "X.Y.Z",
  "description": "Tengo-based template",
  "scripts": {
    "build": "rm -rf dist && pl-tengo check && pl-tengo build",
    "format": "/usr/bin/env emacs --script ./format.el",
    "do-pack": "rm -f *.tgz && pnpm pack && mv *.tgz package.tgz"
  },
  "dependencies": {
    "@platforma-sdk/workflow-tengo": "catalog:"
  },
  "devDependencies": {
    "@platforma-sdk/tengo-builder": "catalog:"
  }
}
```

### Step 5: Migrate Test Package

1. **Update `test/package.json`:**

   - Add `fmt`, `lint`, `type-check` scripts
   - Change `lint` to `ts-builder lint`
   - Add `fmt` script: `ts-builder format`
   - `type-check` should use `ts-builder types --target block-test`
   - Remove `eslint`, `@platforma-sdk/eslint-config` from devDependencies
   - Add `@milaboratories/ts-builder`, `@milaboratories/ts-configs`

2. **Generate configs:** delete existing `tsconfig.json` and run `npx ts-builder init-configs --target block-test` (creates tsconfig.json, .oxlintrc.json, .oxfmtrc.json)

3. **Ensure `test/vitest.config.mts`** exists

4. **Delete:**
   - `test/eslint.config.mjs`
   - `test/.prettierrc`

### Step 6: Verify Block Package

1. Ensure `block/index.d.ts` exists with correct content
2. Ensure `block/index.js` exists with correct content
3. Ensure `block/package.json` has `do-pack` script
4. Remove `pretty` script if present

### Step 7: Update GitHub Workflows (if needed)

Compare `.github/workflows/build.yaml` and `.github/workflows/mark-stable.yaml` with templates above and update as needed.

### Step 8: Verification

```bash
# Install dependencies (no need to remove node_modules)
pnpm install

# Build all packages
pnpm run build

# Run tests (if available)
pnpm run test

# Verify linting works
pnpm run lint
```

All commands should complete without errors.

**Note:** No need to remove `node_modules` or `pnpm-lock.yaml` before running `pnpm install`. Pnpm handles dependency updates automatically.

---

## Migration Checklist

### Root Level

- [ ] `package.json` has no `name` field
- [ ] `package.json` has no `pretty` script
- [ ] `package.json` uses `block-tools update-deps` for update-sdk
- [ ] `package.json` has `lint`, `type-check`, `do-pack` scripts
- [ ] `package.json` has `typescript` in devDependencies
- [ ] `pnpm-workspace.yaml` has `@milaboratories/ts-builder` and `@milaboratories/ts-configs`
- [ ] `pnpm-workspace.yaml` SDK packages use exact versions (no `^` or `~`)
- [ ] `pnpm-workspace.yaml` has no `tsup`, `vite`, `vue-tsc`, `vite-plugin-dts`
- [ ] `pnpm-workspace.yaml` has no `@platforma-sdk/blocks-deps-updater`
- [ ] `turbo.json` has `lint` and `type-check` tasks
- [ ] `turbo.json` build depends on `type-check`, `lint`, `^build`
- [ ] `.prettierrc` is DELETED
- [ ] `scripts/update-sdk-packages.js` is DELETED

### Model Package

- [ ] `package.json` has `exports` field with `sources`
- [ ] `package.json` uses `ts-builder build --target block-model`
- [ ] `package.json` has `fmt`, `lint`, `watch`, `type-check` scripts
- [ ] `package.json` `lint` uses `ts-builder lint`
- [ ] `package.json` `fmt` uses `ts-builder format`
- [ ] `package.json` has no `tsup`, `vite`, `eslint`, `@platforma-sdk/eslint-config` dependencies
- [ ] `tsconfig.json` extends `@milaboratories/ts-configs/block/model`
- [ ] `.oxlintrc.json` exists with `oxlint-block-model.json` preset
- [ ] `.oxfmtrc.json` exists with `oxfmt.json` preset
- [ ] `vitest.config.mts` exists
- [ ] `vite.config.mts` is DELETED
- [ ] `eslint.config.mjs` is DELETED
- [ ] `.prettierrc` is DELETED

### UI Package

- [ ] `package.json` uses `--target block-ui` (not `--target browser`)
- [ ] `package.json` has `vue` in dependencies (not devDependencies)
- [ ] `package.json` has no `vite`, `vue-tsc`, `@vitejs/plugin-vue`, `eslint`, `@platforma-sdk/eslint-config`
- [ ] `package.json` has `fmt`, `lint`, `type-check` scripts
- [ ] `package.json` `lint` uses `ts-builder lint`
- [ ] `package.json` `fmt` uses `ts-builder format`
- [ ] `tsconfig.json` extends `@milaboratories/ts-configs/block/ui`
- [ ] `.oxlintrc.json` exists with `oxlint-block-ui.json` preset
- [ ] `.oxfmtrc.json` exists with `oxfmt.json` preset
- [ ] `vitest.config.mts` exists
- [ ] `vite.config.ts` is DELETED
- [ ] `tsconfig.app.json` is DELETED
- [ ] `tsconfig.node.json` is DELETED
- [ ] `eslint.config.mjs` is DELETED
- [ ] `.prettierrc` is DELETED

### Workflow Package

- [ ] `package.json` has `fmt`, `lint`, `type-check`, `do-pack` scripts
- [ ] `package.json` `lint` uses `ts-builder lint`
- [ ] `package.json` `fmt` uses `ts-builder format`
- [ ] `package.json` type-check uses `--target block-test`
- [ ] `tsconfig.json` extends `@milaboratories/ts-configs/block/test`
- [ ] `.oxlintrc.json` exists with `oxlint-test.json` preset
- [ ] `.oxfmtrc.json` exists with `oxfmt.json` preset
- [ ] `vitest.config.mts` exists
- [ ] Root `index.js` is DELETED (only dist/index.js should exist)
- [ ] Root `index.d.ts` is DELETED (only dist/index.d.ts should exist)
- [ ] `eslint.config.mjs` is DELETED
- [ ] `.prettierrc` is DELETED

### Test Package

- [ ] `package.json` has `fmt`, `lint`, `type-check` scripts
- [ ] `package.json` `lint` uses `ts-builder lint`
- [ ] `package.json` `fmt` uses `ts-builder format`
- [ ] `package.json` type-check uses `ts-builder types --target block-test`
- [ ] `tsconfig.json` extends `@milaboratories/ts-configs/block/test`
- [ ] `.oxlintrc.json` exists with `oxlint-test.json` preset
- [ ] `.oxfmtrc.json` exists with `oxfmt.json` preset
- [ ] `vitest.config.mts` exists
- [ ] `eslint.config.mjs` is DELETED
- [ ] `.prettierrc` is DELETED

### Block Package

- [ ] `index.d.ts` exists with correct content
- [ ] `index.js` exists with correct content
- [ ] `package.json` has `do-pack` script
- [ ] `package.json` has no `pretty` script

### Verification

- [ ] `pnpm install` succeeds
- [ ] `pnpm run build` succeeds
- [ ] `pnpm run test` succeeds
- [ ] `pnpm run lint` succeeds

---

## Common Issues

### "Cannot find module '@milaboratories/ts-configs'"

Ensure `@milaboratories/ts-configs` is in the catalog with exact version and run `pnpm install`.

### Build fails with tsup-related errors

Ensure all references to tsup are removed from package.json files, including inline configuration.

### UI build fails with vite errors

Ensure `vite.config.ts`, `tsconfig.app.json`, and `tsconfig.node.json` are deleted from ui/.

### Type errors after migration

Run `pnpm run type-check` and fix any issues. The new ts-configs may be stricter.

### "ts-builder build --target block-test" fails

The `block-test` target does NOT support build—it's type-check only. Use `ts-builder types --target block-test` instead.

### Linting fails with "Cannot find oxlint" or "Cannot find oxfmt"

Ensure `@milaboratories/ts-builder` is installed. The `ts-builder lint` and `ts-builder format` commands use oxlint and oxfmt binaries bundled with ts-builder.

### Missing `.oxlintrc.json` or `.oxfmtrc.json`

Each package needs its own `.oxlintrc.json` and `.oxfmtrc.json` configuration files. Generate them using CLI commands:

- `npx ts-builder init-configs --target <target>` — generates all configs at once (tsconfig, build, lint, fmt)

---

## Reference

- **Gold standard:** `mixcr-clonotyping` block
- **Build system docs:** `platforma/docs/block-build-system.md`
- **ts-builder:** `@milaboratories/ts-builder`
  - `ts-builder build` — builds TypeScript projects
  - `ts-builder serve` — dev server for browser/UI targets
  - `ts-builder types` — type-checks TypeScript projects
  - `ts-builder lint` — runs oxlint under the hood
  - `ts-builder format` — runs oxfmt under the hood
  - `ts-builder init-configs --target <target>` — generates all configs (tsconfig, build, lint, fmt)
  - `ts-builder init-tsconfig --target <target>` — generates tsconfig.json only
  - `ts-builder init-build-config --target <target>` — generates build config only
  - `ts-builder init-serve-config` — generates serve config only
  - `ts-builder init-lint-config --target <target>` — generates .oxlintrc.json only
  - `ts-builder init-fmt-config` — generates .oxfmtrc.json only
- **ts-configs:** `@milaboratories/ts-configs`
