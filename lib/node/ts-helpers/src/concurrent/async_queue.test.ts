import { test, expect } from '@jest/globals';
import { AsyncQueue } from './async_queue';

test('simple queue test 1', async () => {
  const queue = new AsyncQueue<string>();
  let fullstring = '';

  const a = (async () => {
    const s = await queue.shift();
    fullstring = fullstring + 'A' + s;
  })();

  const b = (async () => {
    const s = await queue.shift();
    fullstring = fullstring + 'B' + s;
  })();

  queue.push('B');
  queue.push('A');

  await a;
  await b;

  expect(fullstring).toEqual('ABBA');
});

test('simple queue test 2', async () => {
  const queue = new AsyncQueue<string>();
  let fullstring = '';

  const a = (async () => {
    const s = await queue.shift();
    fullstring = fullstring + 'A' + s;
  })();

  const b = (async () => {
    const s = await queue.shift();
    fullstring = fullstring + 'B' + s;
  })();

  setTimeout(() => {
    queue.push('B');
    queue.push('A');
  }, 2);

  await a;
  await b;

  expect(fullstring).toEqual('ABBA');
});

test('simple queue test 3', async () => {
  const queue = new AsyncQueue<string>();
  let fullstring = '';

  const a = (async () => {
    const s = await queue.shift();
    fullstring = fullstring + 'A' + s;
  })();

  const b = (async () => {
    const s = await queue.shift();
    fullstring = fullstring + 'B' + s;
  })();

  setTimeout(() => {
    queue.push('B');
  }, 2);

  setTimeout(() => {
    queue.push('A');
  }, 5);

  await a;
  await b;

  expect(fullstring).toEqual('ABBA');
});
