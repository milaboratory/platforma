import { expect, test } from '@jest/globals';
import { isJsonEqual, isPlainObject, timer, randomString } from '@milaboratories/helpers';
import canonicalize from 'canonicalize';

function generateLargeObject(depth: number = 3, breadth: number = 3): unknown {
  const randomData = (): unknown => {
    const types = [
      () => Math.random(),
      () => randomString(10),
      () => Math.floor(Math.random() * 100),
      () => Math.random() < 0.5,
      () => null,
    ];
    return types[Math.floor(Math.random() * types.length)]();
  };

  const buildObject = (currentDepth: number): unknown => {
    if (currentDepth === 0) {
      return randomData();
    }

    const obj: Record<string, unknown> = {};

    for (let i = 0; i < breadth; i++) {
      const key = `key_${randomString(3)}`;
      const shouldNest = Math.random() < 0.5;

      obj[key] = shouldNest
        ? buildObject(currentDepth - 1)
        : randomData();
    }

    const includeArray = Math.random() < 0.5;
    if (includeArray) {
      obj[`array_${randomString(3)}`] = Array.from(
        { length: breadth },
        () => randomData(),
      );
    }

    return obj;
  };

  return buildObject(depth);
}

test('is json equal', async () => {
  expect(isPlainObject([])).toBeFalsy();
  expect(isPlainObject(new Date())).toBeFalsy();
  expect(isPlainObject({})).toBeTruthy();
  expect(isPlainObject(Object.create(null))).toBeTruthy();

  expect(isJsonEqual(1, 1)).toBeTruthy();
  expect(isJsonEqual('1', '1')).toBeTruthy();
  expect(isJsonEqual('1', '0')).toBeFalsy();
  expect(isJsonEqual('1', null)).toBeFalsy();

  expect(isJsonEqual({
    a: 1,
    b: '2',
  }, {
    a: 1,
    b: '2',
  })).toBeTruthy();

  expect(isJsonEqual({
    a: 1,
    b: '2',
    c: undefined,
  }, {
    a: 1,
    b: '2',
  })).toBeTruthy();

  expect(isJsonEqual({
    a: 1,
    b: '2',
    c: null,
  }, {
    a: 1,
    b: '2',
  })).toBeFalsy();

  expect(isJsonEqual({
    a: 1,
    b: '2',
    c: {
      a: [1, 2, 3],
    },
  }, {
    a: 1,
    b: '2',
    c: {
      a: [1, 2, 3],
    },
  })).toBeTruthy();

  expect(isJsonEqual({
    a: 1,
    b: '2',
    c: {
      a: [1, 2, 3],
    },
  }, {
    a: 1,
    b: '2',
    c: {
      a: [1, 2, 3, undefined],
    },
  })).toBeFalsy();

  expect(isJsonEqual({
    a: 1,
    b: '2',
    c: {
      a: [1, 2, 3],
    },
  }, {
    a: 1,
    b: '2',
    c: {
      a: [1, 2, 3],
      z: undefined,
    },
  })).toBeTruthy();

  const symbol = Symbol();

  expect(isJsonEqual({
    a: 1,
    b: '2',
    c: {
      a: [1, 2, 3],
      symbol,
      [symbol]: { a: 1 },
    },
  }, {
    a: 1,
    b: '2',
    c: {
      a: [1, 2, 3],
      symbol,
      [symbol]: { a: 1 },
    },
  })).toBeTruthy();

  expect(() => {
    isJsonEqual({
      a: 1,
      b: '2',
      c: {
        a: [1, 2, 3],
        z: new Set(),
      },
    }, {
      a: 1,
      b: '2',
      c: {
        a: [1, 2, 3],
        z: new Set(),
      },
    });
  }).toThrowError();
}, 1000);

test.skip('speed', async () => {
  function isJsonEqualSlow(a: unknown, b: unknown) {
    return canonicalize(a) === canonicalize(b);
  }

  const obj1 = generateLargeObject(9, 9);

  const obj2 = structuredClone(obj1);

  const dt = timer();

  const res = isJsonEqual(obj1, obj2);

  console.log('isJsonEqual', dt(), res);

  const dt2 = timer();

  const res2 = isJsonEqualSlow(obj1, obj2);

  console.log('isJsonEqualSlow', dt2(), res2);
});
