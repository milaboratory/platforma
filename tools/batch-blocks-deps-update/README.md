# Tool for batch blocks update

For installation:
```sh
curl 
```

## Scripts

### create-changeset.sh

Creates changeset files for all packages in the current monorepo.

**Usage:**
```bash
# Create changeset for current branch
./create-changeset.sh

# Create changeset for specific branch
./create-changeset.sh --branch feat/my-feature

# Only create changeset if there are changes from main
./create-changeset.sh --check-changes
```

**Options:**
- `--branch <name>` - Branch name to use in changeset filename (defaults to current branch)
- `--check-changes` - Only create changeset if there are changes from main branch

This script is automatically called by `update-deps.sh`, but can also be used standalone.

### update-deps.sh

Updates npm package dependencies across multiple repositories and creates PRs.

See `./update-deps.sh --help` for detailed usage.