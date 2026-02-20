# Block Registry v2 Architecture

## Overview

The Block Registry v2 implements a distributed, eventually-consistent package registry built on top of S3-compatible storage. The architecture is designed around a **two-phase publication system** that separates the concerns of package publication from registry overview generation, enabling secure, scalable, and robust package management.

## Core Architecture Principles

### Two-Phase Publication System

Block publication follows a deliberate multi-stage process:

1. **File Upload**: Package files and assets are uploaded to storage
2. **Manifest Upload**: The package manifest is uploaded (serves as "package ready" indicator)
3. **Update Triggers**: Trigger files are created to signal the need for overview refresh
4. **Overview Refresh**: Registry overview files are regenerated based on published packages

_Channel assignment via marker files is optional and can happen independently after publication to modify which channels a published version belongs to._

This architecture provides several critical benefits:

- **Separation of Concerns**: Package publication can be performed from different environments than overview generation
- **Security Model**: Publishers only need write access to their specific organization folders, while overview refresh can run in a more secure environment with broader bucket access
- **Fault Tolerance**: If issues arise with specific block-tools versions during publication, they cannot corrupt the overview files since overview updates are handled separately by a more controlled process
- **Scalability**: Overview refresh can be performed on a schedule (e.g., every minute) by a dedicated service
- **Efficient Updates**: Trigger files allow the refresh process to only reread specific packages rather than scanning the entire registry

### Storage Layout

The registry uses a structured S3-compatible storage layout:

```
v2/
├── overview.json                    # Global registry overview
├── overview.json.gz                 # Compressed global overview
├── org1/
│   └── package1/
│       ├── overview.json            # Package-specific overview
│       ├── 1.0.0/
│       │   ├── manifest.json        # Package manifest (atomicity marker)
│       │   ├── file1.js             # Package files
│       │   └── channels/            # Channel marker files
│       │       ├── stable           # Indicates package is in 'stable' channel
│       │       └── beta             # Indicates package is in 'beta' channel
│       └── 1.1.0/...

_updates_v2/
├── _global_update_in               # Global update trigger
├── _global_update_out              # Global update completion marker
└── per_package_version/            # Per-package update markers
    └── org1/package1/1.0.0/uuid    # Package-specific update triggers
```

### Update Convergence & Atomicity

The registry leverages **S3's strong consistency guarantees**:

- After successful writes, subsequent reads immediately return the latest version
- List operations are strongly consistent after writes
- This enables the seed-based convergence algorithm to work reliably

The **seed-based convergence** system ensures eventual consistency:

1. Package changes create unique UUID seeds in `_updates_v2/per_package_version/`
2. Any change also updates the global seed file `_global_update_in`
3. The refresh process compares `_global_update_in` with `_global_update_out` to detect needed updates
4. After successful refresh, `_global_update_in` is copied to `_global_update_out`
5. Update seed files are cleaned up after processing

This design guarantees that all changes are eventually processed, even if multiple updates occur simultaneously.

## Data Structures

### Package Overview

```typescript
{
  schema: "v2",
  versions: [{
    description: {...},        // Block metadata and configuration
    channels: ["stable"],      // Channels this version belongs to
    manifestSha256: "abc123"   // Integrity verification
  }]
}
```

### Global Overview

```typescript
{
  schema: "v2",
  packages: [{
    id: { organization: "org", name: "pkg" },
    allVersionsWithChannels: [    // All versions with their channels
      { version: "1.0.0", channels: ["stable"] }
    ],
    latestByChannel: {           // Latest version per channel
      "stable": { description: {...}, manifestSha256: "..." },
      "any": { description: {...}, manifestSha256: "..." }
    }
    // Additional backward compatibility fields exist...
  }]
}
```

_Note: Additional metadata fields exist for backward compatibility and internal processing._

## Command-Line Tools

The registry provides several CLI tools for manipulation:

- **`block-tools publish`**: Publishes packages and optionally refreshes the registry
- **`block-tools refresh-registry`**: Manually triggers overview file regeneration
  - Modes: `normal` (process pending updates), `force` (rebuild everything), `dry-run` (simulate)
- **`block-tools mark-stable`**: Adds/removes packages from the `stable` channel (or custom channels)

### Environment Integration

- Registry addresses support both S3 (`s3://bucket/path?region=us-east-1`) and local file (`file:///path/to/registry`) protocols
- Environment variables: `PL_REGISTRY`, `PL_REGISTRY_REFRESH`, `PL_PUBLISH_UNSTABLE`
- Built-in support for both CI/CD pipelines and local development workflows

### Channel System

Packages can be assigned to multiple **channels** (e.g., `stable`, `beta`, `experimental`) after publication. Channels are implemented as simple marker files in the package's `channels/` directory and can be created or deleted independently to modify which channels a published version belongs to. When channel assignments change, corresponding trigger files are created to signal that the overview needs to be refreshed to reflect the new channel assignments. The special `any` channel aggregates all versions regardless of their specific channel assignments.

## Security & Permission Model

The architecture enables fine-grained security:

- **Publishers**: Need write access only to their organization's folder (e.g., `v2/myorg/`) and update markers
- **Registry Refresher**: Requires read access to entire bucket and write access to overview files and cleanup operations
- **Consumers**: Need only read access to overview files and specific package versions

This separation allows publishers to work in restricted environments while maintaining registry integrity through controlled overview updates.
