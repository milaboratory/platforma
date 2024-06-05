import { rawComputable } from './computable_helpers';
import { sleep } from '@milaboratory/ts-helpers';

test('raw computable simple test', async () => {
  let users = 0;
  const c1 = rawComputable((watcher, ctx) => {
    if (!ctx.hasOnDestroy) {
      users++;
      ctx.setOnDestroy(() => users--);
    }
    return 12;
  });

  expect(await c1.getValue()).toEqual(12);
  expect(users).toEqual(1);
  c1.resetState();
  // because onDestroy is scheduled asynchronously we should still see the user
  expect(users).toEqual(1);

  await sleep(0);

  expect(users).toEqual(0);
});

test('raw computable nested test', async () => {
  let users = 0;
  const c1 = rawComputable((watcher, ctx) => {
    if (!ctx.hasOnDestroy) {
      users++;
      ctx.setOnDestroy(() => users--);
    }
    return 12;
  });

  const c2 = rawComputable((watcher, ctx) => {
    return c1;
  });

  expect(await c1.getValue()).toEqual(12);
  expect(users).toEqual(1);

  expect(await c2.getValue()).toEqual(12);
  expect(users).toEqual(2);

  c1.resetState();

  // because onDestroy is scheduled asynchronously we should still see the user
  expect(users).toEqual(2);

  await sleep(0);

  expect(users).toEqual(1);

  c2.resetState();

  // because onDestroy is scheduled asynchronously we should still see the user
  expect(users).toEqual(1);

  await sleep(0);

  expect(users).toEqual(0);
});
