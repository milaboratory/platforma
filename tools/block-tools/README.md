## Table of contents
<!-- toc -->

<!-- tocstop -->

## Usage
<!-- usage -->
```sh-session
$ npm install -g @platforma-sdk/block-tools
$ block-tools COMMAND
running command...
$ block-tools (--version)
@platforma-sdk/block-tools/2.3.28 darwin-arm64 node-v20.15.0
$ block-tools --help [COMMAND]
USAGE
  $ block-tools COMMAND
...
```
<!-- usagestop -->

## Commands
<!-- commands -->
* [`block-tools build-meta`](#block-tools-build-meta)
* [`block-tools build-model`](#block-tools-build-model)
* [`block-tools mark-stable`](#block-tools-mark-stable)
* [`block-tools pack`](#block-tools-pack)
* [`block-tools publish`](#block-tools-publish)
* [`block-tools upload-package-v1`](#block-tools-upload-package-v1)

## `block-tools build-meta`

Extracts meta information from blocks package.json and outputs meta.json with embedded binary and textual information linked from the meta section.

```
USAGE
  $ block-tools build-meta -o <path> [-i <path>]

FLAGS
  -i, --modulePath=<path>   [default: .] input module path
  -o, --destination=<path>  (required) output meta.json file

DESCRIPTION
  Extracts meta information from blocks package.json and outputs meta.json with embedded binary and textual information
  linked from the meta section.
```

## `block-tools build-model`

Extracts and outputs block model JSON from pre-built block model module

```
USAGE
  $ block-tools build-model [-i <path>] [-b <path>] [-o <path>]

FLAGS
  -b, --sourceBundle=<path>  [default: ./dist/bundle.js] bundled model code to embed into the model for callback-based
                             rendering to work
  -i, --modulePath=<path>    [default: .] input module path
  -o, --destination=<path>   [default: ./dist/model.json] output model file

DESCRIPTION
  Extracts and outputs block model JSON from pre-built block model module
```

## `block-tools mark-stable`

Mark target block stable

```
USAGE
  $ block-tools mark-stable -r <address> [-i <path>] [-v <value>] [--refresh] [--unmark]

FLAGS
  -i, --modulePath=<path>         [default: .] input module path
  -r, --registry=<address>        (required) full address of the registry
  -v, --version-override=<value>  override package version
      --[no-]refresh              refresh repository after adding the package
      --unmark                    reverses meaning of this command, flag can be used to remove "stable" flag from the
                                  package

DESCRIPTION
  Mark target block stable
```

## `block-tools pack`

Builds block pack and outputs a block pack manifest consolidating all references assets into a single folder

```
USAGE
  $ block-tools pack [-i <path>] [-o <path>]

FLAGS
  -i, --modulePath=<path>       [default: .] input module path
  -o, --destinationPath=<path>  [default: ./block-pack] output folder

DESCRIPTION
  Builds block pack and outputs a block pack manifest consolidating all references assets into a single folder
```

## `block-tools publish`

Publishes the block package and refreshes the registry (for v2 block-pack schema)

```
USAGE
  $ block-tools publish -r <address> [-m <value>] [-v <value>] [--refresh]

FLAGS
  -m, --manifest=<value>          [default: ./block-pack/manifest.json] manifest file path
  -r, --registry=<address>        (required) full address of the registry
  -v, --version-override=<value>  override package version
      --[no-]refresh              refresh repository after adding the package

DESCRIPTION
  Publishes the block package and refreshes the registry (for v2 block-pack schema)
```

## `block-tools upload-package-v1`

Uploads V1 package and refreshes the registry

```
USAGE
  $ block-tools upload-package-v1 [-r <address|alias>] [-o <value>] [-p <value>] [-v <value>] [-m <value>] [-f
    file_path | package_name=file_path...] [--refresh]

FLAGS
  -f, --file=file_path | package_name=file_path...  [default: ] package files
  -m, --meta=<value>                                json file containing meta information to associate with tha package
  -o, --organization=<value>                        target organisation
  -p, --package=<value>                             target package
  -r, --registry=<address|alias>                    full address of the registry or alias from .pl.reg
  -v, --version=<value>                             target version
      --[no-]refresh                                refresh repository after adding the package

DESCRIPTION
  Uploads V1 package and refreshes the registry
```
<!-- commandsstop -->
