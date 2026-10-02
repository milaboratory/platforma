# TS Builder

Universal build tool for monorepo packages.

## Description

TS Builder provides a unified interface for building different types of projects in the monorepo.

### Block Targets (recommended for blocks)

- `block-model` - Block model packages (ES + UMD bundle, uses Rollup)
- `block-ui` - Block UI packages (Vue + browser, uses Vite, vue-tsc for type-check)
- `block-test` - Block test packages (type-check only, no build)

### General Targets

- `node` - Node.js projects (uses Rollup)
- `browser` - Browser applications (uses Vite)
- `browser-lib` - Browser libraries (uses Vite)

## Installation and Usage

```bash
# Installation
pnpm install ts-builder

# Basic usage
ts-builder --target <type> <command>
```

## Commands

### build

Build the project.

```bash
# Regular build
ts-builder --target node build

# Build in watch mode
ts-builder --target browser build --watch

# Using custom configuration
ts-builder --target browser --build-config custom.config.js build
```

### serve

Start dev server (only for browser/browser-lib projects).

```bash
# Start with default settings
ts-builder --target browser serve

# Custom port and host
ts-builder --target browser serve --port 8080 --host 0.0.0.0

# Using custom configuration
ts-builder --target browser --serve-config custom.serve.js serve
```

### types

TypeScript type checking.

```bash
# Check with default tsconfig.json
ts-builder --target node types

# Using custom tsconfig
ts-builder --target browser types --project ./custom.tsconfig.json
```

### init-build-config

Create build configuration file.

```bash
ts-builder --target node init-build-config
# Creates build.node.config.js
```

### init-serve-config

Create dev server configuration file.

```bash
ts-builder init-serve-config
# Creates serve.config.js
```

### init-tsconfig

Create tsconfig.json file.

```bash
ts-builder --target browser init-tsconfig
# Creates tsconfig.json for browser projects
```

## Options

### Global options

- `--target <type>` - Project type (required)
- `--build-config <path>` - Path to custom build configuration
- `--serve-config <path>` - Path to custom dev server configuration

### Command options

- `build -w, --watch` - Watch mode for automatic rebuilding
- `serve -p, --port <port>` - Port for dev server (default: 3000)
- `serve --host <host>` - Host for dev server (default: localhost)
- `types -p, --project <path>` - Path to tsconfig.json

### Environment variables

- `NO_SOURCEMAPS=1` - Build without JavaScript source maps. By default production builds emit
  `.js.map` files that embed the original TypeScript (`sourcesContent`), so a package published
  with them ships its source. Set this for release builds and keep maps locally for debugging.
  Declaration maps (`.d.ts.map`) contain no source; browser-lib/block-ui builds still emit them,
  node and block model/kind/facade builds drop them too. Add the variable to the
  build task's `env` in `turbo.json`, so builds with and without maps never share a cache entry.

## Block Development Examples

```bash
# Block model: build
ts-builder --target block-model build

# Block UI: dev server
ts-builder --target block-ui serve

# Block UI: build for production
ts-builder --target block-ui build

# Block test: type-check only (no build supported)
ts-builder --target block-test types
```

## General Usage Examples

```bash
# Build Node.js package
ts-builder --target node build

# Dev server for browser application
ts-builder --target browser serve --port 8080

# Type checking for library
ts-builder --target browser-lib types

# Initialize configs for new project
ts-builder --target node init-tsconfig
ts-builder --target node init-build-config
```
