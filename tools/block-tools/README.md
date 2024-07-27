## Table of contents
<!-- toc -->

<!-- tocstop -->

## Usage
<!-- usage -->
```sh-session
$ npm install -g @milaboratory/pl-block-tools
$ block-tools COMMAND
running command...
$ block-tools (--version)
@milaboratory/pl-block-tools/2.1.2 darwin-arm64 node-v20.15.0
$ block-tools --help [COMMAND]
USAGE
  $ block-tools COMMAND
...
```
<!-- usagestop -->

## Commands
<!-- commands -->
* [`block-tools build-model`](#block-tools-build-model)
* [`block-tools pack`](#block-tools-pack)
* [`block-tools upload-package-v1`](#block-tools-upload-package-v1)

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
