import {expect, test} from '@jest/globals';
import {collections} from '@milaboratory/helpers';
import {utils} from '@milaboratory/helpers';

const {toList, range} = utils;

test('SliceBy', async () => {
  const arr = toList(range(1, 100));

  expect(collections.sliceBy(arr, (el) => {
    return el > 90;
  })).toEqual(toList(range(91, 100)));

  expect(collections.sliceBy(arr, (el) => {
    return el > -1;
  })).toEqual(arr);

  expect(collections.sliceBy(arr, (el) => {
    return el > 98;
  })).toEqual([99]);

  expect(collections.sliceBy(arr, (el) => {
    return el > 99;
  })).toEqual([]);

  const big = toList(range(1, 10000));

  const left = 9000;

  const right = 9100;

  const expected = toList(range(left + 1, right));
  
  const slice = collections.sliceBy(big, (el) => {
    return el > left && el < right;
  });

  expect(slice).toEqual(expected);
}, 1000);
