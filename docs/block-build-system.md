# Block Build System

## Why Standardized Block Configs Matter

Block development is done by bioinformaticians—domain experts whose primary focus is science, not build tooling. Every minute spent debugging TypeScript configs, ESLint setup, or deciphering build errors is a minute not spent on the actual science.

**The core principle: zero mental overhead for standard cases.**

## The Problem We Solved

Previously, block authors faced:

- **Inconsistent paths**: Some blocks used `@milaboratories/ts-configs/blocks/tsconfig.model.json`, others used `@milaboratories/ts-configs/block/model`, and some had inline configs entirely
- **Wrong tools for wrong targets**: UI packages using `--target browser` instead of block-specific targets; test packages lacking proper type-checking
- **Missing eslint presets**: Test files using model eslint rules that don't understand vitest globals
- **Build/type-check confusion**: Accidentally trying to "build" test packages when they only need type-checking

## The Solution: Explicit Block Targets

### TypeScript Configs

Clean, memorable paths that match block structure:

```json
// model/tsconfig.json
{ "extends": "@milaboratories/ts-configs/block/model" }

// ui/tsconfig.json  
{ "extends": "@milaboratories/ts-configs/block/ui" }

// test/tsconfig.json
{ "extends": "@milaboratories/ts-configs/block/test" }
```

### Build Targets

Explicit targets that match block concepts:

| Target | Purpose | Type Checker |
|--------|---------|--------------|
| `block-model` | Block model (ES + UMD bundle) | `tsc` |
| `block-ui` | Block UI (Vue + browser) | `vue-tsc` |
| `block-test` | Type-check only (no build) | `tsc` |

### ESLint Presets

Three presets matching block structure:

```javascript
// model/eslint.config.mjs
import { model } from '@platforma-sdk/eslint-config';
export default [...model];

// ui/eslint.config.mjs
import { ui } from '@platforma-sdk/eslint-config';
export default [...ui];

// test/eslint.config.mjs (also workflow when it has TypeScript)
import { test } from '@platforma-sdk/eslint-config';
export default [...test];
```

## Block Structure Reference

A standard block has four parts:

```
my-block/
├── model/          # TypeScript model
│   ├── tsconfig.json      → extends block/model
│   ├── eslint.config.mjs  → uses model
│   └── package.json       → --target block-model
│
├── ui/             # Vue-based UI
│   ├── tsconfig.json      → extends block/ui
│   ├── eslint.config.mjs  → uses ui
│   └── package.json       → --target block-ui
│
├── workflow/       # Tengo templates (+ optional TS tests)
│   ├── tsconfig.json      → extends block/test (for TS tests)
│   ├── eslint.config.mjs  → uses test
│   └── package.json       → pl-tengo build, --target block-test for type-check
│
└── test/           # Block integration tests
    ├── tsconfig.json      → extends block/test
    ├── eslint.config.mjs  → uses test
    └── package.json       → --target block-test (type-check only)
```

## Standard npm Scripts

### model/

```json
{
  "build": "ts-builder build --target block-model && block-tools build-model",
  "watch": "ts-builder build --target block-model --watch",
  "type-check": "ts-builder types --target block-model",
  "lint": "eslint .",
  "test": "vitest"
}
```

### ui/

```json
{
  "dev": "ts-builder serve --target block-ui",
  "build": "ts-builder build --target block-ui",
  "watch": "ts-builder build --target block-ui --watch",
  "type-check": "ts-builder types --target block-ui",
  "lint": "eslint ."
}
```

### test/

```json
{
  "test": "vitest",
  "type-check": "ts-builder types --target block-test",
  "lint": "eslint ."
}
```

Note: `block-test` target does **not** support `build` command—it's type-check only.

### workflow/

```json
{
  "build": "rm -rf dist && pl-tengo check && pl-tengo build",
  "test": "vitest",
  "type-check": "ts-builder types --target block-test",
  "lint": "eslint ."
}
```

## Key Design Decisions

1. **Aliases over uniqueness**: `block/ui` and `browser` resolve to the same underlying config, but explicit naming reduces cognitive load

2. **Fail fast for invalid operations**: Running `ts-builder build --target block-test` gives a clear error instead of silent failure

3. **Vue-aware type checking**: `block-ui` automatically uses `vue-tsc` instead of `tsc`

4. **Test preset includes vitest globals**: No need to manually configure `describe`, `it`, `expect`, etc.

5. **Workflow uses test configs**: TypeScript in workflow is for tests only—use the test preset, not a separate workflow preset
