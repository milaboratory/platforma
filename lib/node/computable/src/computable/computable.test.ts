import { Computable } from './computable';

test('raw computable simple test', async () => {
  let users = 0;
  const c1 = Computable.make(ctx => {
    users++;
    ctx.addOnDestroy(() => users--);
    return 12;
  });

  expect(await c1.getValue()).toEqual(12);
  expect(users).toEqual(1);
  c1.resetState();
  expect(users).toEqual(0);
});

test('computable with post-process', async () => {
  const c1 = Computable.make(ctx => {
    return 12;
  }, {
    postprocessValue: value => String(value)
  });

  expect(await c1.getValue()).toEqual('12');
});

test('nested computable with post-process', async () => {
  const c1 = Computable.make(ctx => {
    return Computable.make(ctx => 12);
  }, {
    postprocessValue: value => String(value)
  });

  expect(await c1.getValue()).toEqual('12');
});

test('computable with recover', async () => {
  const c1 = Computable.make((ctx): number => {
    throw new Error();
    return 12;
  }, {
    recover: () => undefined
  });

  expect(await c1.getValue()).toBeUndefined();
});

test('computable with post-process and recover, error in kernel callback', async () => {
  const c1 = Computable.make(ctx => {
    throw new Error();
    return 12;
  }, {
    postprocessValue: value => String(value),
    recover: () => undefined
  });

  expect(await c1.getValue()).toBeUndefined();
});

test('computable with post-process and recover, error in postprocess', async () => {
  const c1 = Computable.make(ctx => {
    return 12;
  }, {
    postprocessValue: value => {
      throw new Error();
      return String(value);
    },
    recover: () => undefined
  });

  expect(await c1.getValue()).toBeUndefined();
});


test('nested computable with post-process and recover', async () => {
  const c1 = Computable.make(ctx => {
    return Computable.make(ctx => {
      throw new Error();
      return 12;
    });
  }, {
    postprocessValue: value => String(value),
    recover: () => undefined
  });

  expect(await c1.getValue()).toBeUndefined();
});

test('raw computable nested test', async () => {
  let users = 0;
  const c1 = Computable.make(ctx => {
    users++;
    ctx.addOnDestroy(() => users--);
    return 12;
  });

  const c2 = Computable.make(ctx => {
    return c1;
  });

  expect(await c1.getValue()).toEqual(12);
  expect(users).toEqual(1);

  expect(await c2.getValue()).toEqual(12);
  expect(users).toEqual(2);

  c1.resetState();

  expect(users).toEqual(1);

  c2.resetState();

  expect(users).toEqual(0);
});
