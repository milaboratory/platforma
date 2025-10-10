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

  test('zero migrations', async () => {
    const pkgPath = path.join(tempDir, 'package.json');
    const pkgName = '@pkg/example';

    await fs.writeFile(pkgPath, `{
  "name": "test",
  "version": "1.0.0"
}
`);

    const migrator = new Migrator(pkgName, { projectRoot: tempDir });
    await migrator.applyMigrations();
    const updated = await fs.readFile(pkgPath, 'utf8');
    expect(updated).toBe(`{
  "name": "test",
  "version": "1.0.0",
  "migrations": {
    "@pkg/example": 0
  }
}
`);
  })

  test.for([
    {
      name: 'no package migrations',
      initialText: `{
  "name": "test",
  "version": "1.0.0",
  "migrations": {
    "@pkg/example-1": 1
  }
}
`,
      expectMigrations: [],
      expectText: `{
  "name": "test",
  "version": "1.0.0",
  "migrations": {
    "@pkg/example-1": 1,
    "@pkg/example": 3
  }
}
`,
    },
    {
      name: 'no migrations entry',
      initialText: `{
  "name": "test",
  "version": "1.0.0"
}`,
      expectMigrations: [],
      expectText: `{
  "name": "test",
  "version": "1.0.0",
  "migrations": {
    "@pkg/example": 3
  }
}
`,
    }
  ])('new package installation ($name)', async ({ initialText, expectText, expectMigrations }) => {
    const pkgPath = path.join(tempDir, 'package.json');
    const pkgName = '@pkg/example';

    await fs.writeFile(pkgPath, initialText);

    let called: number[] = [];
    const migration = (i: number) => { return () => {called.push(i);} };

    const migrator = new Migrator(pkgName, { projectRoot: tempDir });
    migrator.addMigration(migration(0), migration(1), migration(2)); // 3 migrations
    await migrator.applyMigrations();

    const updated = await fs.readFile(pkgPath, 'utf8');
    expect(updated).toBe(expectText);
    expect(called).toStrictEqual(expectMigrations);
  });

  test('on first install apply all', async () => {
    const pkgPath = path.join(tempDir, 'package.json');
    const pkgName = '@pkg/example';

    await fs.writeFile(pkgPath, `{
  "name": "test",
  "version": "1.0.0"
}
`);

    let called: number[] = [];
    const migration = (i: number) => { return () => {called.push(i);} };

    const migrator = new Migrator(pkgName, { projectRoot: tempDir, onFirstInstall: 'apply-all' });
    migrator.addMigration(migration(0), migration(1), migration(2));
    await migrator.applyMigrations();

    const updated = await fs.readFile(pkgPath, 'utf8');
    expect(updated).toBe(`{
  "name": "test",
  "version": "1.0.0",
  "migrations": {
    "@pkg/example": 3
  }
}
`);
    expect(called).toStrictEqual([0,1,2]);
  })

  test.for([
    {
      name: 'ends with bracket',
      initialText: `{
  "name": "test", "version": "1.0.0",
  "migrations": {
      "@pkg/example"  :   1 }
}
`,
      expectMigrations: [1,2],
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
      "@pkg/example"  :   0
  }
}
`,
      expectMigrations: [0,1,2],
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
    "@pkg/example"  :   2,
    "@pkg/example-2":   4
  }
}
`,
      expectMigrations: [2],
      expectText: `{
  "name": "test", "version": "1.0.0",
  "migrations": {
    "@pkg/example"  :   3,
    "@pkg/example-2":   4
  }
}
`,
    },
  ])('preserve formatting ($name)', async ({ initialText, expectText, expectMigrations }) => {
    const pkgPath = path.join(tempDir, 'package.json');
    const pkgName = '@pkg/example';

    await fs.writeFile(pkgPath, initialText);
    
    let called: number[] = [];
    const migration = (i: number) => { return () => {called.push(i);} };

    const migrator = new Migrator(pkgName, { projectRoot: tempDir });
    migrator.addMigration(migration(0), migration(1), migration(2));
    await migrator.applyMigrations();

    const updated = await fs.readFile(pkgPath, 'utf8');
    expect(updated).toBe(expectText);
    expect(called).toStrictEqual(expectMigrations);
  });
});


