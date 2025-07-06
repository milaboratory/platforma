> **Note:** This document is a work in progress. Its goal is to provide a comprehensive guide to the monorepo's architecture, but it may not be complete.

# Platforma Monorepo Architecture

This document provides a comprehensive overview of the Platforma monorepo, its structure, and the development workflows. It is intended to help new developers get acquainted with the codebase and best practices.

## Project Goal

This monorepo contains the open-source components of [Platforma](https://docs.platforma.bio/), a system for efficient biological data analysis and management. The full system includes a closed-source Desktop application and a proprietary backend, which are developed in separate repositories.

The code in this repository includes the **Platforma SDK** and all the supporting libraries and tools. Packages that are part of the public SDK are identifiable by their `@platforma-sdk/` scope in their `package.json` files.

## Monorepo Overview

This is a [PNPM](https://pnpm.io/) workspace-based monorepo that uses [Turborepo](https://turbo.build/) to manage and optimize development tasks like building, testing, and linting. The codebase is primarily written in TypeScript.

## Package Manager: PNPM

The monorepo uses PNPM for package management.

### Workspaces

Package locations are defined in `pnpm-workspace.yaml`. The packages are organized into several top-level directories:

- `lib/`: Core libraries for the Platforma ecosystem.
- `tools/`: Development and build tools.
- `sdk/`: Contains the public Software Development Kits (SDKs) for developing custom Platforma "blocks".
- `etc/`: Modular components called "blocks" and UI playgrounds.
- `tests/`: Integration and end-to-end tests.

### Version Catalog

A key feature of the PNPM setup is the use of a version `catalog`, defined in `pnpm-workspace.yaml`. This catalog centralizes the versions of all external dependencies, ensuring that the same version of a package (e.g., `typescript`, `vite`, `zod`) is used across all modules in the monorepo. When adding a new dependency that is already in the catalog, you should use the `catalog:` protocol in your `package.json`:

```json
"dependencies": {
  "zod": "catalog:"
}
```

## Core Technologies & Standards

- **Language**: TypeScript
- **Build Tool**: **Vite** is the standard build tool for new packages. `tsup` is considered legacy and may be found in older packages.
- **UI Framework**: Vue.js 3
- **Testing**: **Vitest** is the standard for both unit and integration tests. `jest` is legacy.
- **Task Runner**: Turborepo
- **Linting**: ESLint
- **Formatting**: `prettier` is considered legacy and should not be used in new packages, though it is still used for the workspace-wide `pnpm pretty` script.
- **CLI Tools**: Oclif

## Development Workflow

### Task Runner: Turborepo

Turborepo is used to run tasks across the monorepo efficiently. The main configuration is in `turbo.json`. It defines the dependency pipeline for tasks, ensuring they are executed in the correct order. It also provides powerful caching, which significantly speeds up local and CI builds.

### Common Commands

All common commands should be run from the root of the monorepo.

- **Build**: `pnpm build`
  - This command runs the `build` script in each package, respecting the dependency graph. Outputs are cached in `.turbo` and are typically placed in the `dist/` directory of each package.
- **Test**: `pnpm test`
  - This runs the test suites. Tests depend on a successful build.
- **Lint**: `pnpm lint`
  - This runs the linter across all packages.
- **Type Check**: `pnpm type-check`
  - This runs the TypeScript compiler to check for type errors.

### Running Specific Tests

While `pnpm test` runs all tests across the monorepo, it's often more efficient to run tests for a specific package you are working on. The general pattern is to first build the target package and its dependencies, and then run the test command from within that package's directory.

**To run all tests in a specific package:**

First, build the package using `pnpm build --filter=<package-name>...`. Then, change into the package's directory and run the tests.

```bash
# Example for @milaboratories/pl-middle-layer
pnpm build --filter='@milaboratories/pl-middle-layer...' && \
  (cd lib/node/pl-middle-layer && pnpm run test)
```

**To run tests in a specific file:**

You can pass the path to the test file as an argument to the test command.

```bash
# Example for a specific file in @milaboratories/pl-model-common
pnpm build --filter='@milaboratories/pl-model-common...' && \
  (cd lib/model/common && pnpm run test src/flags/flag_utils.test.ts)
```

**To run a specific test by name:**

Most test runners support a flag (usually `-t` or `--testNamePattern`) to filter tests by their name or description.

```bash
# Example for a test named 'runPythonSoftware' in @milaboratories/pl-middle-layer
pnpm build --filter='@milaboratories/pl-middle-layer...' && \
  (cd lib/node/pl-middle-layer && pnpm run test template.test.ts -t 'runPythonSoftware')
```

### Build Process

Packages are typically built using [Vite](https://vitejs.dev/). The configuration for the build process can usually be found in a `vite.config.ts` or `vite.config.mjs` file within each package. These local configurations are very minimal because they import and use shared build configurations provided by the `@milaboratories/build-configs` package.

For example, a typical Node.js library uses the `PlViteStdNode` configuration, which sets up Vite to:
- Build for both CommonJS and ES Module formats.
- Generate sourcemaps.
- Exclude Node.js built-ins and `node_modules` dependencies from the final bundle.
- Generate TypeScript declaration files (`.d.ts`).

For an example of a typical `package.json` for a Node.js module, you can look at `lib/model/common/package.json` or `tools/package-builder/package.json`.

### Unit Testing

Unit tests should be co-located with the source code they are testing, using a `.test.ts` or `.spec.ts` file extension.

The repository uses [Vitest](https://vitest.dev/) as the primary testing framework. While some older packages use [Jest](https://jestjs.io/), it is considered a legacy tool and **should not be used for new packages**.

- **Vitest**: The root `vitest.workspace.ts` file configures the test environment. Individual packages can have a `vitest.config.mts` for minor adjustments.

### Coding Standards

- **ESLint**: The configuration is typically found in `eslint.config.mjs` files. These files extend a base configuration from the `@milaboratories/eslint-config` package and can add their own specific rules or ignores.
- **Prettier**: While there is a root `.prettierrc` file and a `pnpm pretty` script, `prettier` is considered a legacy tool and should not be added to new packages.

Git hooks are managed by [Husky](https://typicode.github.io/husky/) (see `prepare` script in root `package.json`) and are configured to run checks before commits.

## Shared Configuration Packages

A key architectural pattern in this monorepo is the use of shared configuration packages to ensure consistency and reduce boilerplate.

- **`@milaboratories/build-configs`** (located in `tools/build-configs`): This package provides shared configurations for TypeScript (`tsconfig.json` files) and Vite (`vite.config.mts` files). Packages extend these base configurations instead of writing their own from scratch. The base TypeScript config enables strict checking and modern module formats.
- **`@milaboratories/eslint-config`** (located in `sdk/eslint-config` or `tools/eslint-config`): This package provides a base ESLint configuration that is used by all other packages in the monorepo.
- **`@milaboratories/oclif-index`** (located in `tools/oclif-index`): This is a helper tool used in the build process of Oclif-based CLI packages.

## CLI Tools (Oclif)

Some packages in the `tools/` directory are Command-Line Interface (CLI) tools built with [Oclif](https://oclif.io/). A good example is `@platforma-sdk/package-builder`.

These packages have a `bin` field in their `package.json` that points to the executable script, and an `oclif` section that configures the CLI. Their build process involves an extra step, usually `oclif-index`, before the standard Vite build.

## Integration Testing

The monorepo contains a `tests/` directory that houses packages for integration testing. These test packages are themselves packages within the PNPM workspace.

A good example is the `@milaboratories/drivers-ml-blocks-integration` package. The strategy for integration testing is as follows:
- A dedicated package is created inside the `tests/` directory.
- This package is marked as `"private": true` in its `package.json`.
- It uses the standard tools for building and testing (`vite`, `vitest`).
- It declares dependencies on the specific packages and "blocks" that are being tested.
- The **`@platforma-sdk/test`** package (located in `sdk/test`) provides the official SDK with utilities for testing blocks.

This approach keeps complex integration tests isolated from library code.

## Versioning and Publishing

The monorepo uses [Changesets](https://github.com/changesets/changesets) to manage versioning and releases. When you make a change that should result in a package version bump, you should run `pnpm changeset` and follow the prompts. This will create a new changeset file in the `.changeset` directory.

---
_The content of this document is based on the analysis of the following files. As the documentation evolves, more files will be added to this list._
- `pnpm-workspace.yaml`
- `package.json` (root)
- `turbo.json`
- `lib/model/common/package.json`
- `lib/model/common/tsconfig.json`
- `lib/model/common/vite.config.mts`
- `lib/model/common/vitest.config.mts`
- `lib/model/common/eslint.config.mjs`
- `tools/build-configs/tsconfig_lib_bundled.json`
- `tools/build-configs/src/vite.ts`
- `lib/model/middle-layer/package.json`
- `lib/model/middle-layer/vite.config.mts`
- `tools/package-builder/package.json`
- `tools/package-builder/jest.config.cjs`
- `tools/package-builder/vite.config.mts`
- `tests/block-repo/package.json`
- `tests/drivers-ml-blocks-integration/package.json`
