# @platforma-sdk/pl-cli

CLI for Platforma server state manipulation.

## Usage

```bash
pnpm dlx --allow-build=@milaboratories/pframes-rs-node \
  @platforma-sdk/pl-cli <command> [args...]
```

The `--allow-build=@milaboratories/pframes-rs-node` flag is **required**.
Without it you will get:

```
ModuleLoadError: Cannot find module '.../pframes_rs_node.node'
```

## Commands

- `admin copy-project` — copy a project between users (requires admin credentials)
- `project list` — list projects for a user
- `project info` — show project metadata
- `project duplicate` — duplicate a project
- `project rename` — rename a project
- `project delete` — delete a project

Run `pl-cli <command> --help` for per-command flags.
