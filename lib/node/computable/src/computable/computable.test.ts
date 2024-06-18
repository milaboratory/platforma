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

test('wrap errors not ok', async () => {
  const c1 = Computable.wrapError(
    Computable.make(() => {
      return 12;
    }, {
      postprocessValue: value => {
        throw new Error();
        return String(value);
      }
    })
  );

  expect((await c1.getValue()).ok).toEqual(false);
});

test('wrap errors ok', async () => {
  const c1 = Computable.wrapError(
    Computable.make(() => {
      return 12;
    }, {
      postprocessValue: value => {
        return String(value);
      }
    })
  );

  const v = await c1.getValue();
  expect(v.ok).toEqual(true);
  if (v.ok)
    expect(v.value).toEqual('12');
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

test('testing wider range of types in computables', async () => {
  const dateComputable = Computable.make(() => new Date());
  expect(await dateComputable.getValue()).toBeInstanceOf(Date);
  expect(await Computable.make(() => Computable.make(() => new Date())).getValue()).toBeInstanceOf(Date);
  expect(await Computable.make(() => new Uint32Array(12)).getValue()).toBeInstanceOf(Uint32Array);
  expect(await Computable.make(() => Computable.make(() => new Uint32Array(12))).getValue()).toBeInstanceOf(Uint32Array);
});
