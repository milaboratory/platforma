# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-12-23

### Added
- Initial implementation of `@milaboratories/npm-asset-packer` CLI tool
- Support for dual distribution strategies (NPM-bundled and S3-hosted assets)
- Content-addressable storage using SHA256 hashes
- 4-stage asset resolution strategy:
  - Local-First Resolution (monorepo development)
  - Packaged Resolution (npm bundled assets)
  - Global Cache Resolution (user cache directory)
  - Download Resolution (remote S3 assets)
- TypeScript support with strongly-typed asset access
- Generated type definitions for all assets
- Dual CommonJS/ESM module support
- Zero runtime dependencies (uses Node.js native modules)

### CLI Commands
- `build` - Scans assets, generates manifest, and creates runtime code
- `upload` - Uploads assets to S3 with deduplication
- `prepare` - Downloads assets for eager loading

### Features
- Automatic SHA256 hash calculation for all assets
- Hard-linking for npm mode to avoid duplication
- Recursive asset directory scanning
- Configuration validation with Zod schemas
- Comprehensive error handling and logging
- Support for both absolute and relative asset paths
- Configurable asset and output directories
- S3 integration with AWS SDK v3
- Content-addressable storage to prevent re-uploading existing files

### Development
- Comprehensive test suite with integration tests
- Support for both ESM and CommonJS consumers
- Monorepo-optimized development workflow
- Full TypeScript support with strict type checking
- Vitest-based testing framework
- Turbo build system integration

### Documentation
- Complete README with usage examples
- TypeScript interface documentation
- Configuration examples for both modes
- Development and testing instructions