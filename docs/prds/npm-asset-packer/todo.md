# TODO: `@milaboratories/npm-asset-packer` Implementation

This document outlines the tasks required to implement the `@milaboratories/npm-asset-packer` tool, as specified in the [Product Requirements Document](prd.md). The tasks are broken into phases, with references to the PRD and `docs/general-repository-information.md` for context.

## Phase 1: Scaffolding and Initial Setup

- [ ] **Task 1: Set up the `@milaboratories/npm-asset-packer` package.**
    - **Goal:** Create the basic structure for the new tool within the monorepo.
    - **Location:** `tools/npm-asset-packer`
    - **Actions:**
        1. Create the directory `tools/npm-asset-packer`.
        2. Add the new package path to `pnpm-workspace.yaml`.
        3. Create `package.json` for an Oclif-based CLI tool.
            - *Reference:* Use `tools/package-builder/package.json` as a template for an Oclif tool.
            - Add necessary dependencies like `oclif`, `@aws-sdk/client-s3`, `fs-extra`, `chalk`, and `glob`. Use the `catalog:` protocol for versions where applicable.
            - Configure the `bin`, `files`, and `oclif` fields.
        4. Copy standard configuration files, using `lib/model/common` or `tools/package-builder` as a reference.
            - `tsconfig.json` (extending a base config from `tools/build-configs`)
            - `vite.config.mts` (using `PlViteStdNode` from `tools/build-configs` for a dual CJS/ESM build)
            - `eslint.config.mjs` (extending from `@milaboratories/eslint-config`)
            - `vitest.config.mts` for testing.
        5. Create a placeholder `src/index.ts` file.
    - **Verification:**
        - From the monorepo root, run `pnpm install`. The command should complete successfully.
        - Run `pnpm build --filter="@milaboratories/npm-asset-packer..."`. This should also complete successfully, generating a `dist` directory inside the new package.

## Phase 2: Core Logic and Code Generation

- [ ] **Task 2: Implement the `build` command.**
    - **Goal:** Implement the core logic for scanning assets, calculating hashes, and generating the manifest file.
    - **Location:** `tools/npm-asset-packer/src/commands/build.ts` (following Oclif's command structure).
    - **Actions:**
        1. Implement logic to read the `assetPacker` configuration from the consumer's `package.json`.
        2. Recursively scan the `assets/` directory of the consumer package.
        3. For each asset file, calculate its SHA256 hash and size.
        4. If the mode is `"npm"`, create hard links from the source assets to `dist/assets/<sha256>`.
        5. Generate the `dist/manifest.json` file with the structure defined in the PRD.
    - **Context:** See PRD sections `4.1` and `4.3`.
    - **Verification:** This task's output will be verified during the setup of the test packages in Phase 3.

- [ ] **Task 3: Implement Runtime Code Generation.**
    - **Goal:** Generate the dual CJS/ESM runtime API for consumers.
    - **Location:** The logic will be part of the `build` command.
    - **Actions:**
        1. Generate `dist/index.d.ts` containing the `AssetFile` interface and a strongly-typed `export const` (e.g., `myPackage`). The constant's name should be programmatically derived from the consumer's package name.
        2. Generate `dist/index.js` (CJS) and `dist/index.mjs` (ESM) to export the runtime objects.
        3. Implement the `path()` method's resolution logic as specified in the PRD, including all four stages: Local-First, Packaged, Global Cache, and Download.
        4. Use Node.js's native `https` module for the download logic to avoid adding runtime dependencies.
    - **Context:** See PRD sections `4.4` and `4.5`.
    - **Verification:** This will be verified by the integration tests in Phase 3.

- [ ] **Task 4: Implement `upload` and `prepare` commands.**
    - **Goal:** Implement the commands for managing remote assets with S3.
    - **Location:** `tools/npm-asset-packer/src/commands/upload.ts` and `.../prepare.ts`.
    - **Actions:**
        - **`upload`:** Read `dist/manifest.json`, check S3 for existing objects by hash, and upload any missing files using the default AWS SDK credential chain.
        - **`prepare`:** Read `dist/manifest.json` and download all required assets from their remote URL into the local `dist/assets` directory.
    - **Context:** See PRD section `4.1`.
    - **Verification:** As noted in the PRD, full S3 testing in CI is complex. This will likely require manual testing against a test S3 bucket.

## Phase 3: Testing

- [ ] **Task 5: Set up Test Packages.**
    - **Goal:** Create the packages required to test the `npm` and `linked` resolution modes.
    - **Actions:**
        1. Create the asset provider package at `etc/test-assets`.
            - Add sample files to an `assets/` directory.
            - Configure its `package.json` for `"mode": "npm"` and add a `build` script that invokes `npm-asset-packer build`.
            - List `@milaboratories/npm-asset-packer` as a `devDependency`.
        2. Create consumer packages `tests/assets-test-mjs` and `tests/assets-test-cjs`.
            - Configure them for ES Modules and CommonJS, respectively.
            - Add `etc/test-assets` as a dependency using the `workspace:*` protocol.
            - Set up `vitest` for running tests.
        3. Add all three new packages to `pnpm-workspace.yaml`.
    - **Context:** See PRD section `10.1`.
    - **Verification:**
        - Run `pnpm install`.
        - Run `pnpm --filter=etc/test-assets build`. This command should successfully execute the `npm-asset-packer` CLI and generate the `dist` directory in `etc/test-assets`.

- [ ] **Task 6: Implement Integration Tests.**
    - **Goal:** Write tests to verify the core asset resolution logic in both linked and bundled scenarios.
    - **Location:** The `tests` directories of `tests/assets-test-mjs` and `tests/assets-test-cjs`.
    - **Actions:**
        1.  **Linked Resolution Test:** Call `.path()` on an asset and assert that the returned path points to the original source file in `etc/test-assets/assets/`.
        2.  **NPM-Bundled Resolution Test:** Call `.path({ ignoreLinkedAssets: true })` and assert that the returned path points to the hard-linked file in `etc/test-assets/dist/assets/`.
    - **Context:** See PRD section `10.2`.
    - **Verification:**
        - Run the build and test commands for each test package:
        - `pnpm build --filter='tests/assets-test-mjs...' && (cd tests/assets-test-mjs && pnpm test)`
        - `pnpm build --filter='tests/assets-test-cjs...' && (cd tests/assets-test-cjs && pnpm test)`
        - All tests should pass.
