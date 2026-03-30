# @platforma-sdk/pl-cli

## 0.2.8

### Patch Changes

- @milaboratories/pl-middle-layer@1.53.2

## 0.2.7

### Patch Changes

- @milaboratories/pl-middle-layer@1.53.1

## 0.2.6

### Patch Changes

- Updated dependencies [cfee265]
  - @milaboratories/pl-middle-layer@1.53.0
  - @milaboratories/pl-client@2.18.2

## 0.2.5

### Patch Changes

- @milaboratories/pl-client@2.18.1
- @milaboratories/pl-middle-layer@1.52.1

## 0.2.4

### Patch Changes

- Updated dependencies [6078a1d]
- Updated dependencies [ccb1a70]
  - @milaboratories/pl-middle-layer@1.52.0

## 0.2.3

### Patch Changes

- Updated dependencies [d59f5fe]
  - @milaboratories/pl-middle-layer@1.51.0
  - @milaboratories/pl-client@2.18.0

## 0.2.2

### Patch Changes

- Updated dependencies [5b83cd7]
  - @milaboratories/pl-middle-layer@1.50.1

## 0.2.1

### Patch Changes

- Updated dependencies [220275d]
  - @milaboratories/pl-middle-layer@1.50.0

## 0.2.0

### Minor Changes

- 698fdbb: Add pl-cli: CLI tool for Platforma server state manipulation

  New CLI tool with the following commands:

  - `pl-cli project list` — list all projects
  - `pl-cli project info` — show project details
  - `pl-cli project duplicate` — duplicate a project with auto-rename
  - `pl-cli project rename` — rename a project
  - `pl-cli project delete` — delete a project
  - `pl-cli admin copy-project` — copy project between users (controller auth)
  - `pl-cli admin user-list` — list user roots on server

  All commands support `--format text` (default) and `--format json` output.
