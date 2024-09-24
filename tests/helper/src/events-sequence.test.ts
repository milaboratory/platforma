import {test, expect} from '@jest/globals';
import {utils} from '@milaboratories/helpers';
import {sequence, Emitter} from '@milaboratories/sequences';

const {delay, timer} = utils;

test('test 1', async () => {
  async function* gen() {
    for (let i = 1; i <= 10; i++) {
      yield i;
    }
  }

  const s = sequence(gen());

  const values = await s.map(v => v + 1).map(v => v * 10).filter(v => v % 2 === 0).toArray();

  expect(values.reduce((x, y) => x + y)).toBe(650);
}, 100000);

test('InfiniteTest', async () => {
  const DELAY_MS = 2000;
  async function* gen() {
    let t = 0;
    while (true) {
      yield t;
      const dt = timer();
      await delay(5);
      t += dt();
      if (t > DELAY_MS) {
        break;
      }
    }
  }

  const s = sequence(gen()).map(v => `dt: ${v} ms`);

  const dt = timer();

  for await (const v of s.it()) {
    // console.log('v', v);
  }

  expect(dt()).toBeGreaterThan(DELAY_MS);
}, 100000);


test('MergeTest', async () => {
  async function* gen(delta: number) {
    let t = 0;
    while (true) {
      yield t;
      const dt = timer();
      await delay(delta);
      t += dt();
      if (t > 1000) {
        break;
      }
    }
  }

  const s1 = sequence(gen(10)).map(v => ['s1', v]);
  const s2 = sequence(gen(5)).map(v => ['s2', v]);

  for await (const v of s1.merge(s2).it()) {
    // console.log('tuple', v);
  }
}, 100000);

test('EmitterTest', async () => {
  const em = new Emitter<number>();

  (async () => {
    await delay(1);
    em.emit(10);
    await delay(1);
    em.emit(20);
    await delay(1);
    em.emit(30);
    await delay(1);
    em.emit(40);
    await delay(1);
    em.stop();
  })().catch(console.error);

  for await (const n of em) {
    console.log('got number', n);
  }
}, 10000);

/// @todo

test('PushTestSync', async () => {
  async function* test() {
    console.log('Hello!');
    const x: unknown = yield;
    console.log('First I got: ' + x);
    const y: unknown = yield;
    console.log('Then I got: ' + y);
    yield y;
  }

  const it = test();

  (async () => {
    for await (const v of it) {
      console.log('v', v);
    }
  })().catch(console.error);

  await it.next('First');
  await it.next('hello');
  await it.next('hello again');
}, 100000);


test('PushTestAsync', async () => {
  async function* gen() {
    yield 1;

    yield 2;

    const x: number = yield;

    console.log('got x', x);

    yield x;
  }

  const it = gen();

  await it.next();

  (async () => {
    await delay(10);
    console.log('send 3');
    await it.next(3);
    console.log('send 3 again');
    await it.next(3);
  })().catch(console.error);

  // @ts-ignore
  for await (const v of it) {
    // console.log('v', v);
  }

  await delay(1000);
}, 100000);
