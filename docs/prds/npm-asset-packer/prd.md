# Product Requirements Document: @milaboratories/npm-asset-packer

Author: Dmitry Bolotin  

Date: July 7, 2025  

Status: Final  

Version: 1.4

## 1. Introduction

### 1.1. The Problem

Developing JavaScript/TypeScript libraries that rely on large binary assets (e.g., bioinformatic reference data, ML models, high-resolution media) presents a significant distribution challenge. Bundling these assets directly into an NPM package is impractical, leading to bloated packages, slow installation times, and exceeding registry size limits. Current solutions are ad-hoc, requiring developers to manually script download and access logic, which is error-prone and lacks standardization and type safety.

### 1.2. The Solution

@milaboratories/npm-asset-packer is a command-line tool and runtime library that standardizes the process of creating and consuming NPM packages with large, external assets. It provides a streamlined workflow to:

1. **Package:** Scan a local assets directory.
2. **Distribute:** Upload assets to an S3 bucket using content-addressable storage (SHA256 hashes).
3. **Consume:** Generate a fully typed, dual-module (CJS/ESM) API that allows consumers to access assets seamlessly, whether they are linked locally, bundled in the package, or downloaded either on-install (eager) or on-demand (lazy) from remote storage, based on the package developer's configuration.

This approach keeps the NPM package itself lightweight while providing a robust, efficient, and developer-friendly mechanism for handling large-scale asset dependencies.

## 2. Goals and Objectives

* **Simplify Asset-Heavy Package Creation:** Provide a zero-config-preferred CLI tool to automate the process of uploading assets and generating consumer-facing code.
* **Provide a Unified, Type-Safe API:** Generate a TypeScript declaration file that offers a consistent API for accessing assets, complete with autocompletion, regardless of the underlying storage mechanism (npm vs. remote).
* **Enable Efficient Distribution:** Leverage Amazon S3 for scalable, reliable, and performant distribution of large files.
* **Optimize Storage and Bandwidth:** Use content-addressing (SHA256 hashing) to prevent re-uploading unchanged files and enable efficient client-side caching.
* **Enhance Developer Experience:** Support common development workflows like monorepos (via npm link) and give package developers control over eager (on-install) vs. lazy (on-access) download strategies for their consumers.

## 3. Target Audience

* **Primary:** Developers at Milaboratories creating or maintaining JS/TS libraries that require large binary assets.
* **Secondary:** The wider open-source community of JS/TS developers working in fields like bioinformatics, data science, machine learning, and digital media who face similar asset distribution challenges.

## 4. Core Features & Functionality

### 4.1. CLI Tool (npm-asset-packer)

The tool is intended to be used as a devDependency and invoked via NPM scripts. It provides three main commands:

* **Command:** npm-asset-packer build
* **Functionality:** This command is for local development and build steps.
    1. Reads its configuration from the assetPacker section of package.json.
    2. Recursively scans the ./assets directory.
    3. For each file, it calculates its SHA256 hash.
    4. **In npm mode:** Creates a hard link from the file at sourcePath in the ./assets directory to ./dist/assets/\<sha256\>. This provides an instantaneous, space-efficient "copy" of the asset.
    5. Generates a manifest file at ./dist/manifest.json.
    6. Generates the runtime access code (./dist/index.js, ./dist/index.mjs) and type definitions (./dist/index.d.ts).
* **Command:** npm-asset-packer upload
* **Functionality:** This command is for publishing assets.
    1. Reads configuration from package.json and the manifest from ./dist/manifest.json. (It should fail if the manifest does not exist).
    2. For each entry in the manifest, it checks if an object with the key \<sha256\> already exists in the target S3 bucket.
    3. If the object does not exist, it uploads the corresponding local file from the sourcePath to s3://\<bucket\>/\<prefix\>/\<sha256\>.
* **Command:** npm-asset-packer prepare
* **Functionality:** This command enables the eager download strategy. It is intended to be run by the prepare lifecycle script in the *published* package.
    1. Reads the manifest from ./dist/manifest.json.
    2. For each asset, it downloads the file from its downloadUrl to ./dist/assets/\<sha256\>. This makes the assets available immediately after installation in a consistent location.

### 4.2. package.json Configuration

The tool is configured via a dedicated assetPacker object in the target module's package.json.
```json
{
  "name": "@scope/my-asset-package",
  "version": "1.0.0",
  "assetPacker": {
    "mode": "remote",
    "bucket": "my-company-assets",
    "region": "us-east-1",
    "prefix": "my-asset-package/assets",
    "downloadUrl": "https://cdn.my-company.com/my-asset-package/assets"
  }
}
```
* **mode** (string, required): The mode of operation. Can be "remote" or "npm".
* **bucket** (string, required for remote mode): The name of the S3 bucket for uploads.
* **region** (string, required for remote mode): The AWS region of the S3 bucket.
* **prefix** (string, optional): A path prefix within the S3 bucket to namespace the assets.
* **downloadUrl** (string, required for remote mode): The public base URL (e.g., a CDN) from which assets will be downloaded. The final download URL will be \<downloadUrl\>/\<sha256\>.

### 4.3. Asset Manifest (dist/manifest.json)

A manifest file is generated during the build process to serve as the single source of truth for the generated runtime code and the upload command.

**Structure:** A JSON object mapping the relative asset path to its metadata.
```json
{
  "data/file1.fastq.gz": {
    "sha256": "a1b2c3d4e5f6...",
    "size": 1024768,
    "sourcePath": "assets/data/file1.fastq.gz"
  },
  "images/logo.png": {
    "sha256": "d4e5f6a1b2c3...",
    "size": 15360,
    "sourcePath": "assets/images/logo.png"
  }
}
```
### 4.4. Generated Code (dist/)

The tool generates a dual-module package with type definitions.

* **dist/index.d.ts:**
    * Defines the AssetFile interface.
    * Exports a single top-level constant whose name is derived from the package name (e.g., @scope/my-package becomes myPackage).
    * This constant is strictly typed to provide autocompletion. The keys are a union type of all relative asset paths found in the assets directory.
```typescript
// dist/index.d.ts
export interface AssetFile {
  /** The SHA256 hash of the file content. */
  readonly sha256: string;
  /** The size of the file in bytes. */
  readonly size: number;
  /** The public URL for downloading the file. Undefined in 'npm' mode. */
  readonly downloadUrl?: string;
  /**
   * Resolves the local path to the asset.
   * Triggers a download if the file is not available locally.
   * Returns a promise that resolves to the absolute path of the file on the local filesystem.
   */
  path(): Promise<string>;
}

type AssetKeys = "data/file1.fastq.gz" | "images/logo.png";
export const myAssetPackage: Record<AssetKeys, AssetFile>;
```
* **dist/index.js (CommonJS) & dist/index.mjs (ESM):**
    * These files contain the runtime implementation of the exported constant and the AssetFile objects.
    * The implementation of the path() method will contain the logic for local resolution and remote downloading.

### 4.5. Asset Resolution & Downloading

The path() method provides a unified way to access files, with the download strategy determined by the asset package developer. The resolution order is as follows:

1. **Local-First Resolution (Linked Packages):** It will first attempt to resolve the asset locally from the original assets directory, relative to its own position in node\_modules. This is to support "linked" packages in monorepos or via npm link. It will use a try...catch block around a require.resolve() call (for CJS) or equivalent logic (for ESM) to check for the presence of the original assets directory. If successful, it returns the path immediately.
2. **Packaged Asset Check (Eager/NPM Mode):** It will check for the file within the package's dist/assets/ directory, using the content hash for the filename (e.g., ./dist/assets/\<sha256\>). This location is populated by both the npm mode build and the eager remote mode's prepare script.
3. **Global Cache Check (Lazy Mode):** If the above checks fail, it checks the shared global cache at \~/.cache/mi-asset-packer/\<sha256\>.
4. **Download (Lazy Mode):** If the file is not found anywhere, it is downloaded from its downloadUrl to the **global cache** (\~/.cache/mi-asset-packer/\<sha256\>). The promise resolves with the path to the cached file.
5. **Implementation:** The download client logic within the generated code must use Node.js's native https module to perform downloads. This avoids adding external runtime dependencies (like axios or node-fetch) to the final package, keeping it lightweight.

## 5. Modes of Operation

### 5.1. remote (Default Mode)

This is the primary mode for handling large assets.

* **Build:** Generates manifest and code that points to the downloadUrl.
* **Upload:** Uploads assets to S3.
* **Consumption:** Assets are downloaded based on the strategy defined by the package developer:
    * **Eager:** If the developer includes "prepare": "npm-asset-packer prepare" in their package.json, all assets are downloaded into the package's local ./dist/assets/ directory upon installation.
    * **Lazy:** If no prepare script is included, assets are downloaded to a global cache on first access via the path() method.

### 5.2. npm

This mode is for smaller assets or for maintaining a consistent API without remote storage.

* **Build:** Creates hard links from the source assets to the ./dist/assets/ folder, naming each link by its SHA256 hash. The upload and prepare commands are not needed.
* **Consumption:** The generated path() method resolves directly to the files bundled within the package in node\_modules. No downloading occurs. The downloadUrl property on the AssetFile object will be undefined.

## 6. User Workflows

### 6.1. Asset Package Developer Workflow

1. Initialize a new NPM package.
2. Run npm install @milaboratories/npm-asset-packer \--save-dev.
3. Place all asset files inside a top-level assets/ directory. These files should be tracked by version control (e.g., using Git LFS for very large files).
4. Configure the assetPacker section in package.json.
5. Add scripts to package.json. The prepare script is optional and enables eager downloading for consumers.
    ```json
    "scripts": {
      "build": "npm-asset-packer build",
      "prepublishOnly": "npm-asset-packer upload",
      "prepare": "npm-asset-packer prepare"
    }
    ```
6. Ensure the assets/ directory is *not* listed in the "files" array of package.json.
7. Run npm publish. The prepublishOnly script will run, uploading assets to S3. The dist directory, generated by a prior npm run build command, is then published to NPM.

### 6.2. Asset Package Consumer Workflow

1. Run npm install @scope/my-asset-package. The download behavior (eager or lazy) is handled automatically based on how the developer configured the package.
2. In their code, import the generated constant:
    ```typescript
    import { myAssetPackage } from '@scope/my-asset-package';

    async function processFile() {
      // Autocompletion for 'data/file1.fastq.gz' is available
      const filePath = await myAssetPackage['data/file1.fastq.gz'].path();
      // Use the local file path with other tools
      console.log(`File is available at: ${filePath}`);
    }
    ```
## 7. Technical Requirements

### 7.1. Module Compatibility

The generated code in the dist/ directory MUST be a dual package, supporting both CommonJS (require) and ES Modules (import). The tool will generate index.js (CJS), index.mjs (ESM), and a shared index.d.ts. The host package's package.json should be configured accordingly:
```json
"main": "./dist/index.js",
"module": "./dist/index.mjs",
"types": "./dist/index.d.ts",
"exports": {
  ".": {
    "import": "./dist/index.mjs",
    "require": "./dist/index.js"
  }
}
```
### 7.2. Authentication

The tool will rely **exclusively** on the default AWS SDK credential provider chain (e.g., environment variables AWS\_ACCESS\_KEY\_ID, \~/.aws/credentials file, IAM roles for EC2/ECS). There will be no configuration for access keys or secrets within package.json.

## 8. Out of Scope / Future Features (Post-V1)

* **Cache Management CLI:** A command like npm-asset-packer clear-cache to manually inspect or clear the global asset cache.
* **Multi-Cloud Support:** Support for other object storage providers like Google Cloud Storage or Azure Blob Storage.
* **Advanced Progress Indicators:** More detailed download progress bars for a better user experience during installation.
* **Automatic package.json Modification:** A command to automatically configure the main, module, types, and exports fields in the host package's package.json.

## 9. Success Metrics

* **Adoption:** The number of projects within Milaboratories and externally that adopt the tool.
* **Developer Satisfaction:** Positive qualitative feedback from developers regarding ease of use, reliability, and improved workflows.
* **Performance:** Measurable reduction in npm install times for projects consuming these asset packages compared to bundling assets directly.
* **Package Size:** Significant reduction in the published size of NPM packages that previously contained large assets. 