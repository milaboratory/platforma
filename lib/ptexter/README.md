# @platforma-open/milaboratories.software-ptexter

Text processing utilities backend for Platforma workflows.

## Overview

This package provides Python-based text processing tools that serve as the backend implementation for the Platforma `txt` library. The utilities in this package are designed to be called from Tengo workflows through the corresponding frontend library located at `sdk/workflow-tengo/src/txt/`.

## Architecture

- **Backend (this package)**: Python scripts that perform the actual text processing operations
- **Frontend**: Tengo library (`txt`) that provides a convenient workflow API and calls these backend utilities

## Usage

This package is typically not used directly. Instead, use the `txt` library in your Tengo workflows:

```tengo
txt := import(":txt")

// The txt library will automatically call the appropriate ptexter backend utilities
result := txt.head(inputs.myFile, {lines: 10})
```

The backend utilities are packaged as Platforma software artifacts and automatically managed by the platform's execution environment.

## Development

This package follows the standard Platforma software packaging conventions and is built using the `@platforma-sdk/package-builder` toolchain.
