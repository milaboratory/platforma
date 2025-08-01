import { test, expect } from 'vitest';
import { Computable } from './computable';
import { WatchableValue } from '../watchable_value';

test('raw computable simple test', async () => {
  let users = 0;
  const c1 = Computable.make((ctx) => {
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
  const c1 = Computable.make(
    (ctx) => {
      return 12;
    },
    {
      postprocessValue: (value) => String(value)
    }
  );

  expect(await c1.getValue()).toEqual('12');
});

test('computable with null value', async () => {
  const c1 = Computable.make((ctx) => {
    return null;
  });

  expect(await c1.getValue()).toBeNull();
});

test('nested computable with post-process', async () => {
  const c1 = Computable.make(
    (ctx) => {
      return Computable.make((ctx) => 12);
    },
    {
      postprocessValue: (value) => String(value)
    }
  );

  expect(await c1.getValue()).toEqual('12');
});

test('computable with recover', async () => {
  const c1 = Computable.make(
    (ctx): number => {
      throw new Error();
      return 12;
    },
    {
      recover: () => undefined
    }
  );

  expect(await c1.getValue()).toBeUndefined();
});

test('computable with post-process and recover, error in kernel callback', async () => {
  const c1 = Computable.make(
    (ctx) => {
      throw new Error();
      return 12;
    },
    {
      postprocessValue: (value) => String(value),
      recover: () => undefined
    }
  );

  expect(await c1.getValue()).toBeUndefined();
});

test('computable with post-process and recover, error in postprocess', async () => {
  const c1 = Computable.make(
    (ctx) => {
      return 12;
    },
    {
      postprocessValue: (value) => {
        throw new Error();
        return String(value);
      },
      recover: () => undefined
    }
  );

  expect(await c1.getValue()).toBeUndefined();
});

test('wrap errors not ok', async () => {
  const c1 = Computable.wrapError(
    Computable.make(
      () => {
        return 12;
      },
      {
        postprocessValue: (value) => {
          throw new Error();
          return String(value);
        }
      }
    )
  );

  expect((await c1.getValue()).ok).toEqual(false);
});

test('wrap errors ok', async () => {
  const c1 = Computable.wrapError(
    Computable.make(
      () => {
        return 12;
      },
      {
        postprocessValue: (value) => {
          return String(value);
        }
      }
    )
  );

  const v = await c1.getValue();
  expect(v.ok).toEqual(true);
  if (v.ok) expect(v.value).toEqual('12');
});

test('nested computable with post-process and recover', async () => {
  const c1 = Computable.make(
    (ctx) => {
      return Computable.make((ctx) => {
        throw new Error();
        return 12;
      });
    },
    {
      postprocessValue: (value) => String(value),
      recover: () => undefined
    }
  );

  expect(await c1.getValue()).toBeUndefined();
});

test('raw computable nested test', async () => {
  let users = 0;
  const c1 = Computable.make((ctx) => {
    users++;
    ctx.addOnDestroy(() => users--);
    return 12;
  });

  const c2 = Computable.make((ctx) => {
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

test('nested unstable state', async () => {
  const c1 = Computable.make((ctx) => {
    ctx.markUnstable('unstable_marker');
    return 12;
  });

  const c2 = Computable.make((ctx) => {
    return c1;
  });

  const fullValue = await c1.getFullValue();
  expect(fullValue.stable).toEqual(false);
  expect(fullValue.unstableMarker).toEqual('unstable_marker');
});

test('testing wider range of types in computables', async () => {
  const dateComputable = Computable.make(() => new Date());
  expect(await dateComputable.getValue()).toBeInstanceOf(Date);
  expect(await Computable.make(() => Computable.make(() => new Date())).getValue()).toBeInstanceOf(
    Date
  );
  expect(await Computable.make(() => new Uint32Array(12)).getValue()).toBeInstanceOf(Uint32Array);
  expect(
    await Computable.make(() => Computable.make(() => new Uint32Array(12))).getValue()
  ).toBeInstanceOf(Uint32Array);
});

test('change source marker', async () => {
  const watchable = new WatchableValue(1);
  const wc = watchable;
  const c1 = Computable.make((ctx) => ctx.accessor(wc).getValue() + (ctx.changeSourceMarker ?? 'undefined'));

  expect(await c1.getValue()).toBe('1undefined');

  watchable.setValue(2, 'test');

  expect(await c1.getValue()).toBe('2test');
});

test('nested computable test 1', async () => {
  const watchable = new WatchableValue(1);
  const wc = watchable.asComputable();
  const c1 = Computable.make((ctx) => wc);

  expect(await c1.getValue()).toBe(1);

  watchable.setValue(2);

  expect(await c1.getValue()).toBe(2);
});

test('nested computable test 2', async () => {
  const watchable = new WatchableValue(1);
  const wc = watchable.asComputable();
  const c1 = Computable.make((ctx) => ({ a: wc, b: wc }));

  expect(await c1.getValue()).toEqual({ a: 1, b: 1 });

  watchable.setValue(2);

  expect(await c1.getValue()).toEqual({ a: 2, b: 2 });
});

test('nested computable test 3', async () => {
  const watchable = new WatchableValue(1);
  const wc = watchable.asComputable();
  const c1 = Computable.make((ctx) => ({ a: wc, b: wc }), {
    postprocessValue: ({ a, b }) => a + b
  });

  expect(await c1.getValue()).toEqual(2);

  watchable.setValue(2);

  expect(await c1.getValue()).toEqual(4);
});

test('nested computable test 4', async () => {
  const watchable = new WatchableValue(1);
  const wc = watchable.asComputable();
  const c1 = Computable.make(() =>
    Computable.make((ctx) => ({ a: wc, b: wc }), {
      postprocessValue: ({ a, b }) => a + b,
      key: 'a'
    })
  );

  expect(await c1.getValue()).toEqual(2);

  watchable.setValue(2);

  expect(await c1.getValue()).toEqual(4);
});

test('nested computable with post-process and recover 2', async () => {
  const watchable = new WatchableValue(1);

  const wc = watchable.asComputable();

  const c = Computable.make(
    () => {
      return wc;
    },
    {
      postprocessValue: (value) => String(value),
    }
  )
  .wrap({
    postprocessValue: (value) => {
      if (value === '3') {
        throw new Error('Test error');
      }

      return Number(value);
    },
    recover: () => {
      return 100;
    }
  })
  .wrap({
    postprocessValue: (value): number | boolean => {
      if (value === 2) {
        throw new Error('Test error');
      }

      return Number(value);
    },
    recover: (): boolean => {
      return false;
    }
  });

  expect(await c.getValue()).toEqual(1);

  watchable.setValue(2);

  expect(await c.getValue()).toEqual(false);

  watchable.setValue(3);

  expect(await c.getValue()).toEqual(100);
});
