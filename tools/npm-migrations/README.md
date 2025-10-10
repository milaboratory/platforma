# @platforma-sdk/npm-migrations

Minimal migration runner for npm postinstall using a `migrations` section in `package.json`.

Behavior:
- If no migration record found for a package, no migrations are executed and the version is set to latest (migrations length).
- If a record exists, migrations are applied one-by-one from the recorded index to the latest, updating `migrations[packageName]` after each step.

Usage:

```ts
import { Migrator } from '@platforma-sdk/npm-migrations';

const migrator = new Migrator('your-package-name');

migrator.addMigration(() => {
  // do stuff
})

migrator.addMigration(() => {
  // do stuff
})

await migrator.applyMigrations()
```
