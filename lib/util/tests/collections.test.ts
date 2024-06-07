import {expect, test} from '@jest/globals';
import {collections} from '@milaboratory/helpers';
import {utils} from '@milaboratory/helpers';

const {toList, range} = utils;

test('SliceBy', async () => {
  const arr = toList(range(1, 10000));

  const left = 9000;

  const right = 9100;

  const expected = toList(range(left + 1, right));
  
  const slice = collections.sliceBy(arr, (el) => {
    return el > left && el < right;
  });

  expect(slice).toEqual(expected);
}, 1000);
