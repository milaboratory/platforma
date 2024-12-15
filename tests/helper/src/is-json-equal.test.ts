import { expect, test } from '@jest/globals';
import { isJsonEqual, isPlainObject } from '@milaboratories/helpers';

test.only('is json equal', async () => {
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
