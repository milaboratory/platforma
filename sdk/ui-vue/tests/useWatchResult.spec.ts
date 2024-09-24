import { expect, test } from 'vitest';
import { computed, reactive } from 'vue';
import type { OptionalResult } from 'lib';
import { useWatchResult } from 'lib';
import { delay } from '@milaboratory/helpers';

const waitForResolve = (v: OptionalResult<unknown>) => {
  const t = new Date().getTime();
  return new Promise<number>((resolve, reject) => {
    const interval = setInterval(() => {
      const dt = new Date().getTime() - t;

      if (dt > 2000) {
        clearInterval(interval);
        reject('Timeout error');
      }

      if (v.value || v.errors) {
        clearInterval(interval);
        resolve(dt);
      }
    }, 10);
  });
};

test('useWatchResult', async () => {
  const data = reactive({
    counter: 0,
  });

  const doubleCounter = computed(() => data.counter * 2);

  const res = useWatchResult(
    () => doubleCounter.value,
    async (v) => {
      await delay(v === 6 ? 100 : 1);

      if (v === 4) {
        throw Error('Test error');
      }

      return `${v}`;
    },
  );

  await waitForResolve(res).then((dt) => {
    console.log(`waited for ${dt} ms`);
  });

  expect(res.value).toEqual('0');

  expect(res.errors).toBeUndefined();

  data.counter = 1;

  await waitForResolve(res).then((dt) => {
    console.log(`waited for ${dt} ms`);
  });

  expect(res.value).toEqual('2');

  expect(res.errors).toBeUndefined();

  data.counter = 2;

  await waitForResolve(res).then((dt) => {
    console.log(`waited ${dt} ms`);
  });

  expect(res.value).toBeUndefined();

  expect(res.errors).toBeDefined();

  data.counter = 3;

  await delay(0);

  data.counter = 4;

  await delay(200);

  expect(res.value).toEqual('8');

  expect(res.errors).toBeUndefined();
});
