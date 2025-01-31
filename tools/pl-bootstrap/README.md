# The CLI multitool for Platforma Block developers.

## Installation
```bash
npm install --global @platforma-sdk/bootstrap@latest
# or
pnpm install --global @platforma-sdk/bootstrap@latest
```
or use it without installation with
```bash
npx @platforma-sdk/bootstrap@latest '<args>'
# or
pnpx @platforma-sdk/bootstrap@latest '<args>'
```

## Key features:
- empty block skeleton generation
- local Platforma Backend service control

## Usage:

```
pl-dev '<command>'
# or without installation
npx @platforma-sdk/bootstrap@latest '<command>'
```

The tool has 'tree' command structure, like `aws-cli`, `docker`, `git` and many other CLI software: 
commands about specific type of operations are grouped under common prefix, i.e. all operations for 
platforma backend service instances are under `svc` group:
```bash
pl-dev svc create --help
```

All commands have `--help` flag that make the command to report its usage information:
```bash
pl-dev --help
```

## Local Platforma Backend service control

To create, change, start, stop and delete Platforma Backend on your local computer, use commands in `svc` group:
- `pl-dev svc create docker NAME` creates instance of Platforma Backend inside docker container on your local computer. You can start/stop this instance with `svc up NAME` and `svc down NAME` commands, and connect to it via `localhost:6345` address.
- `pl-dev svc list` lists available service instances you created earlier.

Here are few examples on how to prepare your first instance of Platforma Backend started right on your laptop without any containerisation:

```bash
pl-dev svc create local MyLocalPl
pl-dev svc up MyLocalPl
```

The tool will download Platforma Backend archive for your OS and architecture, generate configuration file and all necessary directories.
`up` command will make the service instance start.

## Block skeleton generation

To create new block skeleton, run
```bash
pl-dev create-block
```
