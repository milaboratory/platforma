import { describe, expect, beforeEach, afterEach, test } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Migrator } from './index';

let tempDir: string;

describe('Apply migrations', () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-migrations-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("no migrations entry", async () => {
    const pkgPath = path.join(tempDir, 'package.json');
    const pkgName = '@pkg/example';

    const initialText = `{
  "name": "test",
  "version": "1.0.0"
}
`;
    const expectText = `{
  "name": "test",
  "version": "1.0.0",
  "migrations": {
    "@pkg/example": 2
  }
}
`

    await fs.writeFile(pkgPath, initialText);

    let migrationCalled = false;
    const migration = async () => {migrationCalled = true;};

    const migrator = new Migrator(pkgName, { projectRoot: tempDir });
    migrator.addMigrations(migration, migration); // 2 migrations
    await migrator.run();

    const updated = await fs.readFile(pkgPath, 'utf8');
    expect(updated).toBe(expectText);
    expect(migrationCalled).toBe(false);
  });

  test('no package migrations entry', async () => {
    const pkgPath = path.join(tempDir, 'package.json');
    const pkgName = '@pkg/example';

    const initialText = `{
  "name": "test",
  "version": "1.0.0",
  "migrations": {
    "@pkg/example-1": 1
  }
}
`;
    const expectText = `{
  "name": "test",
  "version": "1.0.0",
  "migrations": {
    "@pkg/example-1": 1,
    "@pkg/example": 3
  }
}
`
    await fs.writeFile(pkgPath, initialText);

    let migrationCalled = false;
    const migration = async () => {migrationCalled = true;};

    const migrator = new Migrator(pkgName, { projectRoot: tempDir });
    migrator.addMigrations(migration, migration, migration); // 3 migrations
    await migrator.run();

    const updated = await fs.readFile(pkgPath, 'utf8');
    expect(updated).toBe(expectText);
    expect(migrationCalled).toBe(false);
  });

  test.for([
    {
      name: 'ends with bracket',
      initialText: `{
  "name": "test", "version": "1.0.0",
  "migrations": {
      "@pkg/example"  :   1 }
}
`,
      expectText: `{
  "name": "test", "version": "1.0.0",
  "migrations": {
      "@pkg/example"  :   3 }
}
`,
    },
    {
      name: 'ends with newline',
      initialText: `{
  "name": "test", "version": "1.0.0",
  "migrations": {
      "@pkg/example"  :   1
  }
}
`,
      expectText: `{
  "name": "test", "version": "1.0.0",
  "migrations": {
      "@pkg/example"  :   3
  }
}
`,
    },
    {
      name: 'ends with comma',
      initialText: `{
  "name": "test", "version": "1.0.0",
  "migrations": {
    "@pkg/example"  :   1,
    "@pkg/example-2":   4
  }
}
`,
      expectText: `{
  "name": "test", "version": "1.0.0",
  "migrations": {
    "@pkg/example"  :   3,
    "@pkg/example-2":   4
  }
}
`,
    },
  ])('preserve formatting ($name)', async ({ initialText, expectText }) => {
    const pkgPath = path.join(tempDir, 'package.json');
    const pkgName = '@pkg/example';

    await fs.writeFile(pkgPath, initialText);
    
    let m1Applied = false;
    let m2Applied = false;
    let m3Applied = false;
    const migration1 = async () => {m1Applied = true;};
    const migration2 = async () => {m2Applied = true;};
    const migration3 = async () => {m3Applied = true;};

    const migrator = new Migrator(pkgName, { projectRoot: tempDir });
    migrator.addMigrations(migration1, migration2, migration3); // 3 migrations
    await migrator.run();

    const updated = await fs.readFile(pkgPath, 'utf8');
    expect(updated).toBe(expectText);
    expect(m1Applied).toBe(false);
    expect(m2Applied).toBe(true);
    expect(m3Applied).toBe(true);
  });
});


