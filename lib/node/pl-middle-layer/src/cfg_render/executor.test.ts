import {
  Args,
  BlockConfigBuilder,
  ConfigResult,
  getJsonField, getResourceField, getResourceValueAsJson,
  isolate, It, MainOutputs,
  makeObject,
  mapArrayValues, PlResourceEntry
} from '@milaboratory/sdk-block-config';
import { computableFromCfg } from './executor';
import { field, Pl, TestHelpers } from '@milaboratory/pl-client-v2';
import { SynchronizedTreeState } from '@milaboratory/pl-tree';
import { Computable } from '@milaboratory/computable';
import { MiddleLayerDrivers } from './operation';

test('local cfg test (no pl)', async () => {
  const args = {
    theC: 'c',
    a: { c: 'hi' },
    b: ['a', 'b', 'c']
  };
  const theCValue = getJsonField(Args, 'theC');

  const cfg = BlockConfigBuilder.create<typeof args>('Heavy')
    .initialArgs(args)
    .output('out1', getJsonField(getJsonField(Args, 'a'), theCValue))
    .output('out2', mapArrayValues(getJsonField(Args, 'b'), isolate(makeObject({ theField: It }))))
    .build();

  const ctx = { $args: args };

  const computable1 = computableFromCfg({} as MiddleLayerDrivers, ctx, cfg.outputs['out1']);
  const out1 = (await computable1.getValue()) as ConfigResult<typeof cfg.outputs['out1'], typeof ctx>;
  expect(out1).toEqual('hi');

  const computable2 = computableFromCfg({} as MiddleLayerDrivers, ctx, cfg.outputs['out2']);
  const out2 = (await computable2.getValue()) as ConfigResult<typeof cfg.outputs['out2'], typeof ctx>;
  expect(out2).toStrictEqual([{ theField: 'a' }, { theField: 'b' }, { theField: 'c' }]);
});

type TestResourceValue = {
  someField: number
}

test('cfg test with pl, simple', async () => {
  const input = {
    theC: 'c'
  };
  const theCValue = getJsonField(Args, 'theC');

  const cfg = BlockConfigBuilder.create<typeof input>('Heavy')
    .initialArgs(input)
    .output('out1', getJsonField(
      getResourceValueAsJson<TestResourceValue>()(getResourceField(MainOutputs, theCValue)),
      'someField'))
    .build();

  await TestHelpers.withTempRoot(async pl => {
    const tree = await SynchronizedTreeState.init(pl, pl.clientRoot, { pollingInterval: 250, stopPollingDelay: 500 });

    const ctx = {
      $args: input,
      $prod: tree.entry() as any as PlResourceEntry
    };

    const computable: Computable<ConfigResult<typeof cfg.outputs['out1'], typeof ctx> | undefined> =
      computableFromCfg({} as MiddleLayerDrivers, ctx, cfg.outputs['out1']) as any;

    expect(await computable.getValue()).toBeUndefined();

    await pl.withWriteTx('addingTestResource', async tx => {
      tx.createField(field(pl.clientRoot, 'c'), 'Dynamic',
        tx.createValue(Pl.JsonObject, JSON.stringify({ someField: 42 } as TestResourceValue)));
      await tx.commit();
    });

    await computable.refreshState();

    expect(await computable.getValue()).toEqual(42);
  });
});
