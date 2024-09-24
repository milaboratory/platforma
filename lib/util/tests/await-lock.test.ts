import {expect, test} from '@jest/globals';
import {utils} from '@milaboratory/helpers';
import { functions } from '@milaboratory/helpers';

test('Await lock', async () => {
  const lock = new functions.AwaitLock();

  let isRunning = false;

  async function call() {
    if (isRunning) {
      throw Error('concurrent');
    }
    isRunning = true;
    await utils.delay(10);
    isRunning = false;
  }

  function all(length: number, cb: () => Promise<void>) {
    return Promise.all(Array.from({length}, () => cb())).then(res => {
      return res.length;
    });
  }

  async function lockCall() {
    await lock.acquireAsync();
    try {
      await call();
    } finally {
      lock.release();
    }
  }

  const repeats = 100;

  await expect( all(repeats, call)).rejects.toThrow('concurrent');

  isRunning = false;

  await expect( all(repeats, lockCall)).resolves.toEqual(repeats);
});