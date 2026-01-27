import { describe, expect, it } from 'vitest';
import { DataModel, DataUnrecoverable, defineDataVersions, makeDataVersioned } from './block_migrations';

describe('defineDataVersions', () => {
  it('throws on duplicate version values', () => {
    expect(() =>
      defineDataVersions({
        V1: 'v1',
        V2: 'v1', // duplicate!
      }),
    ).toThrow('Duplicate version values: v1');
  });

  it('throws on empty version values', () => {
    expect(() =>
      defineDataVersions({
        V1: 'v1',
        V2: '', // empty!
      }),
    ).toThrow('Version values must be non-empty strings (empty: V2)');
  });

  it('allows unique version values', () => {
    const versions = defineDataVersions({
      V1: 'v1',
      V2: 'v2',
    });
    expect(versions.V1).toBe('v1');
    expect(versions.V2).toBe('v2');
  });
});

describe('makeDataVersioned', () => {
  it('creates correct DataVersioned shape', () => {
    const versioned = makeDataVersioned('v1', { count: 42 });
    expect(versioned).toStrictEqual({ version: 'v1', data: { count: 42 } });
  });
});

describe('DataModel migrations', () => {
  it('resets to initial data on unknown version', () => {
    const Version = {
      V1: 'v1',
      V2: 'v2',
    } as const;

    type VersionedData = {
      [Version.V1]: { count: number };
      [Version.V2]: { count: number; label: string };
    };

    const dataModel = DataModel
      .from<VersionedData>(Version.V1)
      .migrate(Version.V2, (v1) => ({ ...v1, label: '' }))
      .create(() => ({ count: 0, label: '' }));

    const result = dataModel.migrate(makeDataVersioned('legacy', { count: 42 }));
    expect(result.version).toBe('v2');
    expect(result.data).toStrictEqual({ count: 0, label: '' });
    expect(result.warning).toBe(`Unknown version 'legacy'`);
  });

  it('uses recover() for unknown versions', () => {
    const Version = {
      V1: 'v1',
      V2: 'v2',
    } as const;

    type VersionedData = {
      [Version.V1]: { count: number };
      [Version.V2]: { count: number; label: string };
    };

    const dataModel = DataModel
      .from<VersionedData>(Version.V1)
      .migrate(Version.V2, (v1) => ({ ...v1, label: '' }))
      .recover((version, data) => {
        if (version === 'legacy' && typeof data === 'object' && data !== null && 'count' in data) {
          return { count: (data as { count: number }).count, label: 'recovered' };
        }
        throw new DataUnrecoverable(version);
      })
      .create(() => ({ count: 0, label: '' }));

    const result = dataModel.migrate(makeDataVersioned('legacy', { count: 7 }));
    expect(result.version).toBe('v2');
    expect(result.data).toStrictEqual({ count: 7, label: 'recovered' });
    expect(result.warning).toBeUndefined();
  });

  it('returns initial data on migration failure', () => {
    const Version = {
      V1: 'v1',
      V2: 'v2',
    } as const;

    type VersionedData = {
      [Version.V1]: { numbers: number[] };
      [Version.V2]: { numbers: number[]; label: string };
    };

    const dataModel = DataModel
      .from<VersionedData>(Version.V1)
      .migrate(Version.V2, (v1) => {
        if (v1.numbers.includes(666)) {
          throw new Error('Forbidden number');
        }
        return { ...v1, label: 'ok' };
      })
      .create(() => ({ numbers: [], label: '' }));

    const result = dataModel.migrate(makeDataVersioned('v1', { numbers: [666] }));
    expect(result.version).toBe('v2');
    expect(result.data).toStrictEqual({ numbers: [], label: '' });
    expect(result.warning).toBe(`Migration v1→v2 failed: Forbidden number`);
  });
});

// Compile-time typing checks
const Version = defineDataVersions({
  V1: 'v1',
  V2: 'v2',
});

type VersionedData = {
  [Version.V1]: { count: number };
  [Version.V2]: { count: number; label: string };
};

DataModel
  .from<VersionedData>(Version.V1)
  .migrate(Version.V2, (v1) => ({ ...v1, label: '' }))
  .create(() => ({ count: 0, label: '' }));

// @ts-expect-error invalid initial version key
DataModel.from<VersionedData>('v3');

// @ts-expect-error invalid migration target key
DataModel.from<VersionedData>(Version.V1).migrate('v3', (v1) => ({ ...v1, label: '' }));

// @ts-expect-error migration return type must match target version
DataModel.from<VersionedData>(Version.V1).migrate(Version.V2, (v1) => ({ ...v1, invalid: true }));
