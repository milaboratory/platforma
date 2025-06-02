import { expect, test } from 'vitest';
import { useDebounceFn } from '@vueuse/core';
import { delay } from '@milaboratories/helpers';

test('useDebounceFn', async () => {
  const s = {
    r: 0,
  };

  const debouncedFn = useDebounceFn(async (i: number) => {
    await delay(0);
    console.log('fn', i);
    s.r = i;
  }, 20, { maxWait: 40 });

  const t1 = performance.now();
  for (let i = 0; i < 10; i++) {
    await delay(10);
    debouncedFn(i);
  }

  console.log('calls span', performance.now() - t1);

  await delay(200);
  console.log('s.r', s.r);
  expect(s.r).toBe(9);
});
