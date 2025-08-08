# @milaboratories/npm-asset-packer

A CLI tool for managing large binary assets in NPM packages, enabling efficient storage, distribution, and resolution of binary files through either NPM bundles or remote S3 storage.

## Features

- **Dual Distribution Strategy**: Support for both NPM-bundled and S3-hosted assets
- **Content-Addressable Storage**: SHA256-based asset identification and deduplication
- **4-Stage Asset Resolution**: Local-First → Packaged → Global Cache → Download
- **TypeScript Support**: Strongly-typed asset access with generated type definitions
- **Monorepo-Friendly**: Optimized for monorepo development workflows
- **Zero Runtime Dependencies**: Uses Node.js native modules for downloads

## Installation

```bash
pnpm add -D @milaboratories/npm-asset-packer
```

## Configuration

Add an `assetPacker` configuration to your `package.json`:

### NPM Mode (Bundle assets with package)

```json
{
  "name": "my-package",
  "assetPacker": {
    "mode": "npm"
  }
}
```

### Remote Mode (Host assets on S3)

```json
{
  "name": "my-package",
  "assetPacker": {
    "mode": "remote",
    "bucket": "my-assets-bucket",
    "region": "us-west-2",
    "prefix": "assets/my-package/",
    "downloadUrl": "https://my-assets-bucket.s3.amazonaws.com"
  }
}
```

## Usage

### 1. Prepare Assets

Place your binary assets in an `assets/` directory:

```
my-package/
├── assets/
│   ├── models/
│   │   ├── model.bin
│   │   └── weights.dat
│   ├── config.json
│   └── readme.txt
├── package.json
└── ...
```

### 2. Build Package

```bash
npx npm-asset-packer build
```

This generates:
- `dist/manifest.json` - Asset metadata and SHA256 hashes
- `dist/index.js` - CommonJS runtime
- `dist/index.mjs` - ES Module runtime
- `dist/index.d.ts` - TypeScript definitions
- `dist/assets/` - Asset files (npm mode) or prepared downloads (remote mode)

### 3. Use Assets in Code

```typescript
import { myPackage } from 'my-package';

// Get asset metadata
const model = myPackage['models/model.bin'];
console.log(model.sha256); // Content hash
console.log(model.size);   // File size in bytes

// Resolve asset path (async)
const modelPath = await model.path();
console.log(modelPath); // Absolute path to file

// For remote mode, check download URL
if (model.downloadUrl) {
  console.log(model.downloadUrl); // S3 download URL
}
```

## Commands

### build

Scans assets, generates manifest, and creates runtime code.

```bash
npm-asset-packer build [options]
```

**Options:**
- `--assets-dir <path>` - Assets directory (default: `assets`)
- `--output-dir <path>` - Output directory (default: `dist`)

### upload

Uploads assets to S3 (remote mode only).

```bash
npm-asset-packer upload [options]
```

**Options:**
- `--check-existing` - Skip files that already exist in S3 (default: true)

### prepare

Downloads all assets for eager loading (remote mode only).

```bash
npm-asset-packer prepare [options]
```

**Options:**
- `--force` - Re-download existing files (default: false)

## Asset Resolution Strategy

The tool implements a 4-stage resolution strategy:

1. **Local-First Resolution**: Check if original source file exists (monorepo development)
2. **Packaged Resolution**: Use bundled asset in `dist/assets/` (npm mode)
3. **Global Cache Resolution**: Check user's global cache directory
4. **Download Resolution**: Download from remote URL and cache (remote mode)

## TypeScript Integration

The tool generates strongly-typed asset access:

```typescript
// Generated types based on your assets
export interface AssetFile {
  sha256: string;
  size: number;
  downloadUrl?: string;
  path(options?: { ignoreLinkedAssets?: boolean }): Promise<string>;
}

// Strongly-typed asset object
export const myPackage: {
  'models/model.bin': AssetFile;
  'models/weights.dat': AssetFile;
  'config.json': AssetFile;
  'readme.txt': AssetFile;
};
```

## Configuration Examples

### Basic NPM Package

```json
{
  "name": "@myorg/ml-models",
  "scripts": {
    "build": "npm-asset-packer build"
  },
  "assetPacker": {
    "mode": "npm"
  },
  "files": ["dist"]
}
```

### Remote S3 Package

```json
{
  "name": "@myorg/large-datasets",
  "scripts": {
    "build": "npm-asset-packer build",
    "upload": "npm-asset-packer upload",
    "prepare": "npm-asset-packer prepare"
  },
  "assetPacker": {
    "mode": "remote",
    "bucket": "myorg-datasets",
    "region": "us-east-1",
    "prefix": "datasets/v1/",
    "downloadUrl": "https://datasets.myorg.com"
  },
  "files": ["dist"]
}
```

## Development

### Running Tests

```bash
# Run all tests
pnpm test

# Run integration tests
pnpm build --filter='@milaboratories/assets-test-mjs...' && (cd tests/assets-test-mjs && pnpm test)
pnpm build --filter='@milaboratories/assets-test-cjs...' && (cd tests/assets-test-cjs && pnpm test)
```

### Building

```bash
pnpm build
```

## License

UNLICENSED