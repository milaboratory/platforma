# JS Builder

Universal build tool for monorepo packages.

## Description

JS Builder provides a unified interface for building different types of projects in the monorepo:
- `node` - Node.js projects (uses Rollup)
- `browser` - Browser applications (uses Vite)  
- `browser-lib` - Browser libraries (uses Vite)
- `block-model` - Block models (uses Rollup)

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

## Usage Examples

```bash
# Example: build Node.js package
ts-builder --target node build

# Example: dev server for browser application
ts-builder --target browser serve --port 8080

# Example: type checking for library
ts-builder --target browser-lib types

# Example: initialize all configs for new project
ts-builder --target node init-tsconfig
ts-builder --target node init-build-config
```
