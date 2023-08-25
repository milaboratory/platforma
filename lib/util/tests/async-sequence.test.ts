import {test, beforeEach, expect} from '@jest/globals';
import {delay, arrayFrom} from '@milaboratory/helpers';
import {sequence} from '@milaboratory/sequences';

beforeEach(() => {
  global.console = require('console');
});

test('AsyncSequence 1', async () => {
  let values = arrayFrom(10, i => i);

  async function* gen() {
    while (values.length) {
      yield values.shift()!;
      await delay(10);
    }
  }

  const s = sequence(gen())
    .map(v => v + 1)
    .map(v => v * 10)
    .map(v => v / 10)
    .filter(v => v % 2 === 0);

  const results: number[] = [];

  for await (const v of s.it()) {
    results.push(v);
  }

  expect(results.reduce((x, y) => x + y)).toBe(30);
}, 10000);

test('AsyncSequence 1', async () => {
  const arr = arrayFrom(1000, i => i);

  async function* gen(): AsyncIterable<number> {
    while (arr.length) {
      yield arr.shift()!;
    }
  }

  const result = await sequence(gen())
    .map(v => v * 3)
    .map(v => v * 3)
    .map(v => v / 3)
    .map(v => v * 3)
    .filter(v => v % 2 === 0)
    .filter(v => v % 10 === 0)
    .slice(0, 10)
    .reduce((acc, v) => acc + v, 0)
  ;

  expect(result).toBe(4050);
}, 10000);

export {}
