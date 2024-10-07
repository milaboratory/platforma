import { test, expect } from '@jest/globals';
import { utils } from '@milaboratories/helpers';
import { sequence } from '@milaboratories/sequences';

test('BasicSeqTest', async () => {
  const s = sequence([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  for (const v of s
    .map((v) => v + 1)
    .map((v) => v * 10)
    .filter((v) => v % 2 === 0)
    .it()) {
    expect(v % 2).toEqual(0);
  }
}, 100000);

test('BasicSeqTest2', async () => {
  const arr = utils.arrayFrom(10000000, (i) => i);

  const n = 177112;

  const r1 = arr
    .map((v) => v * 3)
    .map((v) => v * 3)
    .map((v) => v / 3)
    .map((v) => v * 3)
    .filter((v) => v % 2 === 0)
    .filter((v) => v % n === 0)
    .slice(0, 10)
    .reduce((acc, v) => acc + v, 0);
  const r2 = sequence(arr)
    .map((v) => v * 3)
    .map((v) => v * 3)
    .map((v) => v / 3)
    .map((v) => v * 3)
    .filter((v) => v % 2 === 0)
    .filter((v) => v % n === 0)
    .slice(0, 10)
    .toArray()
    .reduce((acc, v) => acc + v, 0);
  expect(r1).toStrictEqual(r2);
}, 100000);
