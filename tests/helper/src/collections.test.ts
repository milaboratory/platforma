import { expect, test } from '@jest/globals';
import { collections } from '@milaboratories/helpers';
import { utils } from '@milaboratories/helpers';

const { toList, range } = utils;

test('Times', () => {
  expect(utils.times(0, (i) => i)).toEqual([]);
  expect(utils.times(1, (i) => i).reduce((x, y) => x + y)).toBe(0);
  expect(utils.times(2, (i) => i).reduce((x, y) => x + y)).toBe(1);
  expect(utils.times(3, (i) => i).reduce((x, y) => x + y)).toBe(3);
});

test('SliceBy', async () => {
  const arr = toList(range(1, 100));

  expect(
    collections.sliceBy(arr, (el) => {
      return el > 90;
    })
  ).toEqual(toList(range(91, 100)));

  expect(
    collections.sliceBy(arr, (el) => {
      return el > -1;
    })
  ).toEqual(arr);

  expect(
    collections.sliceBy(arr, (el) => {
      return el > 98;
    })
  ).toEqual([99]);

  expect(
    collections.sliceBy(arr, (el) => {
      return el > 99;
    })
  ).toEqual([]);

  const big = toList(range(1, 10000));

  const left = 9000;

  const right = 9100;

  const expected = toList(range(left + 1, right));

  const slice = collections.sliceBy(big, (el) => {
    return el > left && el < right;
  });

  expect(slice).toEqual(expected);
}, 1000);
