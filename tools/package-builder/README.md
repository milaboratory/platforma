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
        "< asset | conda | docker | binary | environment >": {
          "artifact": { "// artifact definition" },
          "cmd": [ "command", "and", "args", "to", "run", "// args defined in workflow will be appended to this list" ],
        },
      }
    }
  }
}
```

Entrypoint is a thing that can be used in block workflow to reach the artifact, described by this entrypoint.
For example, if entrypoint describes python software, workflow of a block will be able to call the python script of this entrypoint.

Full entrypoint ID consists of NPM package name, that contains this entrypoint, and entrypoint name in this package. I.e.
```
@platforma-open/milaboratories.software-binary-collection:7zip
```

## Before you go

The result of any software build is two "artifacts": the archive with your software (or many archives, if software is OS/Arch-dependant)
and npm package with software metadata, used by backend to get the software on its side when you run the block.

Do NOT put software `binaries/scripts/whatever` into `dist/` directory, as it will be published as part of NPM package and most likely will be rejected by NPM registry because of the size.

## Entrypoint configurations

### Asset entrypoint

You can provide static files as an archive that can be downloaded on demand by backend and used in workdirs along with software.
This is useful for genome indexes packing to use them in several blocks or by different types of software in a single block workflow.

```json
{
  "entrypoints": {
    "<ep-name>": {
      "asset": {
        "root": "<asset-content-dir>"
      }
    }
  }
}
```

Example:
```json
{
  "entrypoints": {
    "human-genome-index": {
      "asset": {
        "root": "./human-genome/"
      }
    }
  }
}
```

### Binary entrypoint

Allows you to export arbitrary binary software that is platform-dependent.
Supported platforms are:
- linux-x64
- linux-aarch64
- macosx-x64
- macosx-aarch64
- windows-x64

The list of platforms that is supported by your software can be smaller. In that case, just define less platforms in configuration.

When specifying the command to run, use `{pkg}` placeholder to reach installed software root directory on the remote end.

```json
{
  "entrypoints": {
    "<ep-name>": {
      "binary": {
        "artifact": {
          "type": "binary",
          "roots": {
            "<platform-type>": "<path to dir with binaries>",
            "...": "..."
          }
        },
        "cmd": ["cmd", "to", "run"]
      }
    }
  }
}
```

Example:
```json
{
  "entrypoints": {
    "main": {
      "binary": {
        "artifact": {
          "type": "binary",
          "roots": {
            "linux-x64": "build/linux-amd64",
            "macosx-aarch64": "build/macos-apple-silicon",
            "windows-x64": "build/windows"
          }
        },
        "cmd": ["{pkg}/my-binary"]
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
          "roots": {
            "linux-x64": "build/linux-x64",
            "macosx-x64": "build/darwin-x64"
          }
        },
        "cmd": ["ANARCI"]
      }
    }
  }
}
```

### Java entrypoint

Run java software with given Java runtime.
The Java runtime can be packed separately using `run-environment` entrypoint type.
This allows to split platform-dependent code (JVM itself) and platform-agnostic (java application implementation).

```json
{
  "entrypoints": {
    "my-java-app": {
      "binary": {
        "artifact": {
          "type": "java",
          "root": "app/java",
          "environment": "@milaboratory/runenv-java-corretto:21.2.0.4.1"
        },
        "cmd": ["java", "-jar", "{pkg}/my-app.jar"]
      }
    }
  }
}
```

### Python entrypoint

Run python software with given python runtime.
The Python runtime can be packed separately using `run-environment` entrypoint type.
This allows to split platform-dependent code (interpreter itself and libs) and platform-agnostic (python application implementation).

```json
{
  "entrypoints": {
    "my-python-script": {
      "binary": {
        "artifact": {
          "type": "python",
          "root": "src/",
          "environment": "@milaboratory/runenv-python:3.11.0",
          "dependencies": {
            "requirements": "requirements.txt"
          }
        },
        "cmd": ["python", "main.py"]
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
          "root": "src/",
          "environment": "@milaboratory/runenv-r:4.3.0"
        },
        "cmd": ["Rscript", "{pkg}/main.R"]
      }
    }
  }
}
```

### Docker entrypoint

For some software types Dockerfile is generated automatically and software is packed not only to archives, 
but also to docker image.

You can define custom way to build docker image for your software. This is useful for such cases like R and Java software, 
which do not have autogenerated Dockerfiles.

```json
{
  "entrypoints": {
    "my-docker-app": {
      "docker": {
        "artifact": {
          "context": "src/",
          "dockerfile": "Dockerfile"
        },
        "cmd": ["python", "main.py"]
      }
    }
  }
}
```

Docker settings can be placed next to the artifact settings of particular software:
```json
{
  "entrypoints": {
    "my-docker-app": {
      "binary": { "..." },
      "docker": { "..." }
    }
  }
}
```

### Environment entrypoint

Allows to provide run environment for cross-platform software.
We support following run environments: Python, Java, R.

```json
{
  "entrypoints": {
    "my-python-env": {
      "environment": {
        "artifact": {
          "runtime": "python",
          "roots": {
            "linux-x64": "build/linux-x64",
            "macosx-aarch64": "build/macos-x64",
            "win32-x64": "build/win32"
          }
        }
      }
    }
  }
}
```

### Reference entrypoint

You can re-export existing entrypoint from another package with different name. 
This allows block workflow to use the same software under different names or have a 'collection' 
of different softwares under the same package name prefix.

```json
{
  "entrypoints": {
    "<ep-name>": {
      "reference": "<other-entrypoint-ID>"
    }
  }
}
```

Example:
```json
{
  "entrypoints": {
    "3.12.10": {
      "reference": "@platforma-open/milaboratories.software-python-3.12.10:main"
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
