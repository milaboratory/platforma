import { describe, test, expect } from 'vitest';
import { matchPColumn } from './selectors';
import type { PColumnSpec, AxisSpec } from './spec';

describe('matchPColumn', () => {
  // Test data
  const testColumn: PColumnSpec = {
    kind: 'PColumn',
    name: 'testColumn',
    valueType: 'Int',
    domain: {
      domain1: 'value1',
      domain2: 'value2',
    },
    axesSpec: [
      {
        name: 'x',
        type: 'String',
        domain: {
          key: 'xDomain',
        },
      } as AxisSpec,
      {
        name: 'y',
        type: 'String',
        domain: {
          key: 'yDomain',
        },
      } as AxisSpec,
    ],
    annotations: {
      anno1: 'value1',
      anno2: 'value2',
    },
  };

  test('matches on name', () => {
    expect(matchPColumn(testColumn, { name: 'testColumn' })).toBe(true);
    expect(matchPColumn(testColumn, { name: 'wrongName' })).toBe(false);
  });

  test('matches on name pattern', () => {
    expect(matchPColumn(testColumn, { namePattern: 'test.*' })).toBe(true);
    expect(matchPColumn(testColumn, { namePattern: 'wrong.*' })).toBe(false);
  });

  test('matches on value type', () => {
    expect(matchPColumn(testColumn, { type: 'Int' })).toBe(true);
    expect(matchPColumn(testColumn, { type: 'String' })).toBe(false);
    expect(matchPColumn(testColumn, { type: ['Int', 'Double'] })).toBe(true);
    expect(matchPColumn(testColumn, { type: ['String', 'Float'] })).toBe(false);
  });

  test('matches on domain', () => {
    expect(matchPColumn(testColumn, { domain: { domain1: 'value1' } })).toBe(true);
    expect(matchPColumn(testColumn, { domain: { domain1: 'wrongValue' } })).toBe(false);
    expect(matchPColumn(testColumn, { domain: { nonExistentDomain: 'value' } })).toBe(false);
  });

  test('matches on axes', () => {
    expect(matchPColumn(testColumn, {
      axes: [
        {
          name: 'x',
          type: 'String',
          domain: {
            key: 'xDomain',
          },
        },
        {
          name: 'y',
          type: 'String',
          domain: {
            key: 'yDomain',
          },
        },
      ],
    })).toBe(true);

    // Test partial match
    expect(matchPColumn(testColumn, {
      axes: [{
        name: 'x',
        type: 'String',
        domain: {
          key: 'xDomain',
        },
      }],
      partialAxesMatch: true,
    })).toBe(true);

    // Test failed match (wrong axis)
    expect(matchPColumn(testColumn, {
      axes: [{
        name: 'z',
        type: 'String',
        domain: {
          key: 'zDomain',
        },
      }],
      partialAxesMatch: true,
    })).toBe(false);

    // Test failed match (count mismatch with exact matching)
    expect(matchPColumn(testColumn, {
      axes: [{
        name: 'x',
        type: 'String',
        domain: {
          key: 'xDomain',
        },
      }],
    })).toBe(false);
  });

  test('matches on annotations', () => {
    expect(matchPColumn(testColumn, { annotations: { anno1: 'value1' } })).toBe(true);
    expect(matchPColumn(testColumn, { annotations: { anno1: 'wrongValue' } })).toBe(false);
    expect(matchPColumn(testColumn, { annotations: { nonExistentAnno: 'value' } })).toBe(false);
  });

  test('matches on annotation patterns', () => {
    expect(matchPColumn(testColumn, { annotationPatterns: { anno1: 'value\\d' } })).toBe(true);
    expect(matchPColumn(testColumn, { annotationPatterns: { anno1: 'wrong.*' } })).toBe(false);
    expect(matchPColumn(testColumn, { annotationPatterns: { nonExistentAnno: '.*' } })).toBe(false);
  });

  test('matches on multiple criteria', () => {
    expect(matchPColumn(testColumn, {
      name: 'testColumn',
      type: 'Int',
      domain: { domain1: 'value1' },
      annotations: { anno1: 'value1' },
    })).toBe(true);

    expect(matchPColumn(testColumn, {
      name: 'testColumn',
      type: 'Int',
      domain: { domain1: 'wrongValue' }, // This will fail
      annotations: { anno1: 'value1' },
    })).toBe(false);
  });
});
