# Usage examples

## Main commands
```bash
pl-pkg build [ --dev=local ] # build all available targets
pl-pkg build [ --dev=local ] descriptors [ binary | docker | ... ] # build only sw.json file
pl-pkg build [ --dev=local ] packages # pack .tgz archive
pl-pkg build [ --dev=local ] docker # build docker image
pl-pkg build [ --dev=local ] ...

pl-pkg prepublish # ensures that all artifacts are uploaded, re-generates fresh sw.json files for packing into npm package

pl-pkg publish # publish everything that can be published
pl-pkg publish packages # publish software package to registry
```

## Basic workflow in package.json
```json
{
  "scripts": {
    "build": "pl-pkg build",
    "prepublishOnly": "pl-pkg prepublish"
  }
}
```

# Software configuration structure

## Overview

Package builder reads the configuration inside `package.json` file that describes an npm package, where you define your software.
It uses `"block-software"` section inside `package.json` to read what entrypoints this software provides for Platforma Workflows.

The structure of `block-software` inside `package.json` looks like this:

```json
{
  "block-software": {
    "entrypoints": { 
      "ep-name": { 
        "binary|conda|environment|asset": {
          "artifact": { "// artifact definition" },
          "cmd": [ "// command and args to run", "// args defined in workflow will be appended to this list" ],
        }
      }
    }
  }
}
```

## Entrypoint structures

### Reference entrypoint
References another package's entrypoint:

```json
{
  "entrypoints": {
    "my-reference": {
      "reference": "@milaboratory/runenv-java-corretto:21.2.0.4.1/java"
    }
  }
}
```

### Asset entrypoint
Provides static files or data:

```json
{
  "entrypoints": {
    "my-asset": {
      "asset": {
        "type": "asset",
        "registry": "my-registry.com",
        "name": "my-asset",
        "version": "1.0.0",
        "root": "dist/assets"
      }
    }
  }
}
```

### Binary entrypoint
Executes binary software:

```json
{
  "entrypoints": {
    "my-binary": {
      "binary": {
        "artifact": {
          "type": "binary",
          "registry": "my-registry.com",
          "name": "my-binary",
          "version": "1.0.0",
          "roots": {
            "linux-x64": "dist/linux-x64",
            "darwin-x64": "dist/darwin-x64",
            "win32-x64": "dist/win32-x64"
          }
        },
        "cmd": ["my-binary"],
        "envVars": ["MY_VAR=value"]
      }
    }
  }
}
```

### Java entrypoint
Executes Java software with runtime environment:

```json
{
  "entrypoints": {
    "my-java-app": {
      "binary": {
        "artifact": {
          "type": "java",
          "registry": "my-registry.com",
          "name": "my-java-app",
          "version": "1.0.0",
          "root": "dist/java",
          "environment": "@milaboratory/runenv-java-corretto:21.2.0.4.1"
        },
        "cmd": ["java", "-jar", "my-app.jar"],
        "envVars": ["JAVA_OPTS=-Xmx2g"]
      }
    }
  }
}
```

### Python entrypoint
Executes Python software with pip dependencies:

```json
{
  "entrypoints": {
    "my-python-script": {
      "binary": {
        "artifact": {
          "type": "python",
          "registry": "my-registry.com",
          "name": "my-python-script",
          "version": "1.0.0",
          "root": "dist/python",
          "environment": "@milaboratory/runenv-python:3.11.0",
          "dependencies": {
            "toolset": "pip",
            "requirements": "requirements.txt"
          },
          "docker-registry": "my-docker-registry.com",
          "pkg": "my-python-script"
        },
        "cmd": ["python", "main.py"],
        "envVars": ["PYTHONPATH=/app"]
      }
    }
  }
}
```

### R entrypoint
Executes R software with runtime environment:

```json
{
  "entrypoints": {
    "my-r-script": {
      "binary": {
        "artifact": {
          "type": "R",
          "registry": "my-registry.com",
          "name": "my-r-script",
          "version": "1.0.0",
          "root": "dist/r",
          "environment": "@milaboratory/runenv-r:4.3.0"
        },
        "cmd": ["Rscript", "main.R"],
        "envVars": ["R_LIBS=/app/libs"]
      }
    }
  }
}
```

### Conda entrypoint
Executes software with Conda environment:

```json
{
  "entrypoints": {
    "my-conda-app": {
      "conda": {
        "artifact": {
          "type": "conda",
          "registry": "my-registry.com",
          "name": "my-conda-app",
          "version": "1.0.0",
          "roots": {
            "linux-x64": "dist/linux-x64",
            "darwin-x64": "dist/darwin-x64",
            "win32-x64": "dist/win32-x64"
          },
          "micromamba-version": "1.4.0",
          "conda-root-dir": "conda-env",
          "spec": "environment.yml",
          "docker-registry": "my-docker-registry.com",
          "pkg": "my-conda-app"
        },
        "cmd": ["python", "main.py"],
        "envVars": ["CONDA_DEFAULT_ENV=my-env"]
      }
    }
  }
}
```

### Docker entrypoint
Uses custom Docker image:

```json
{
  "entrypoints": {
    "my-docker-app": {
      "docker": {
        "artifact": {
          "type": "docker",
          "registry": "my-docker-registry.com/my-app",
          "context": "docker",
          "dockerfile": "Dockerfile",
          "pkg": "my-docker-app"
        },
        "cmd": ["python", "main.py"],
        "envVars": ["APP_ENV=production"]
      }
    }
  }
}
```

### Environment entrypoint
Provides runtime environment for other software:

```json
{
  "entrypoints": {
    "my-python-env": {
      "environment": {
        "artifact": {
          "type": "environment",
          "registry": "my-registry.com",
          "name": "my-python-env",
          "version": "1.0.0",
          "roots": {
            "linux-x64": "dist/linux-x64",
            "darwin-x64": "dist/darwin-x64",
            "win32-x64": "dist/win32-x64"
          },
          "runtime": "python",
          "python-version": "3.11.0",
          "binDir": "bin",
          "envVars": ["PYTHONPATH=/app"]
        },
        "envVars": ["GLOBAL_VAR=value"]
      }
    }
  }
}
```

## Artifact type reference

### Supported artifact types
- `asset` - Static files and data
- `environment` - Runtime environments (Java, Python, R)
- `binary` - Platform-specific binary packages
- `java` - Java applications with runtime environment
- `python` - Python applications with pip dependencies
- `R` - R applications with runtime environment
- `docker` - Custom Docker images
- `conda` - Conda-based applications

### Platform support
- **Cross-platform**: `asset`, `java`, `python`, `R`
- **Platform-specific**: `binary`, `environment`, `conda`
- **Docker auto-generation**: `python`, `conda`

### Registry configuration
All artifacts support registry configuration:
```json
{
  "registry": "my-registry.com"  // Simple string
}
// or
{
  "registry": {
    "name": "my-registry",
    "downloadURL": "https://downloads.example.com",
    "storageURL": "https://storage.example.com"
  }
}
```

## Building specific artifact types

- `pl-pkg build packages`
- `pl-pkg build docker`

## Automatic docker images generation for software

- python and conda supports automatic docker images generation out of binary software definition
- generated dockerfiles are kept in `dist/docker/`
- docker images generation is disabled by default outside CI
- to enable it use `pl-pkg build --docker-build` or set `PL_DOCKER_BUILD=true` env variable. This will build all types of software artifacts: binary packages and docker images
- to build solely docker images use `pl-pkg build docker`.

# Tips and tricks

## Using the same artifact for several entrypoints and commands

## Defining custom docker image generation for entrypoint
