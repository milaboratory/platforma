# Code structure

## Type definitions

All input data validation and structures we work with are defined in `src/core/schemas/` directory.
Here are 3 'layers' of the data we have in `package-builder`:

- artifacts: configurations, that are buildable into archive/docker image/whatever and distributed separately from the meta software information. All artifact shapes are defined in `src/core/schemas/artifacts.ts`
- entrypoints: configurations, that describe how to run particular software as part of Platforma Backend workflow. All entrypoint shapes are defined in `src/core/schemas/entrypoints.ts`
- sw.json (or as.json for assets): the metadata for built software, that describes how and where to obtain software artifact and how to run it on backend side (cmd+args, default environment variables and so on). All sw.json shapes are defined in `src/core/schemas/sw-json.ts`

As TypeScript processes files from top to bottom, types must be defined before they are used. Consequently, the most abstract and composite types are typically found at the bottom of each schema file.
All shape definition files follow the naming convention:

- all zod shapes have `Schema` suffix in their names: i.e. `dockerSchema`, `condaSchema`, ...
- all types, derived from zod shapes, have `Type` suffix in their name and are named after the shape they were derived from: `dockerType`, `condaType`, ...

Key types and shapes you might be interested in:

- `artifacts.ts -> anyArtifactSchema, anyArtifactType`
- `entrypoints.ts -> entrypointSchema, entrypointType`
- `sw-json.ts -> swJsonSchema, swJsonType`
- `core.ts -> Core` - all main actions that can be done by the software
- `package-info.ts -> PackageInfo` -> access to configuration in `package.json`. Parsed and indexed.
- `sw-json-renderer.ts -> SwJsonRenderer` -> transformation of entrypoints/artifacts into final `sw.json` files digestible by Platforma Workflows.

## Build process overview:

Init stage:

- instantiate `Core` class (`core.ts -> Core`)
  - read and parse `package.json` file by instantiating `package-info.ts -> PackageInfo` class
- Run particular core action (build packages, build docker images and so on)

Build artifacts stage:

- software packages (archives with binaries) along with artifact location files
- docker images along with artifact location files
- automatic publication of docker images (content-addressable push)

Publication:

- building descriptors (sw.json files) out of artifact location files
- final check that all artifacts exist in remote registries
- build and publish of npm package with sw.json files

As a final result, we have:

- bunch of artifacts uploaded to registries (docker images, assets, software archives)
- npm package with bunch of sw.json and as.json files that point to these artifacts and can be used on backend side to run the software.
