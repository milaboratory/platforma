import {
  Args,
  BlockConfig,
  BlockModel,
  getJsonField,
  getResourceField,
  getResourceValueAsJson,
  InferOutputType,
  isolate,
  It,
  MainOutputs,
  makeObject,
  mapArrayValues,
  PlResourceEntry,
  TypedConfig
} from '@platforma-sdk/model';
import { computableFromCfg, computableFromCfgUnsafe } from './executor';
import { field, Pl, TestHelpers } from '@milaboratories/pl-client';
import { SynchronizedTreeState } from '@milaboratories/pl-tree';
import { Computable } from '@milaboratories/computable';
import { MiddleLayerDriverKit } from '../middle_layer/driver_kit';

test('local cfg test (no pl)', async () => {
  const args = {
    theC: 'c',
    a: { c: 'hi' },
    b: ['a', 'b', 'c']
  };
  const theCValue = getJsonField(Args, 'theC');

  const cfg = (
    BlockModel.create<typeof args>('Heavy')
      .initialArgs(args)
      .output('out1', getJsonField(getJsonField(Args, 'a'), theCValue))
      .output(
        'out2',
        mapArrayValues(getJsonField(Args, 'b'), isolate(makeObject({ theField: It })))
      )
      .done() as any
  ).config as BlockConfig;

  const ctx = { $args: args };

  const computable1 = computableFromCfgUnsafe(
    {} as MiddleLayerDriverKit,
    ctx,
    cfg.outputs['out1'] as TypedConfig
  );
  const out1 = (await computable1.getValue()) as InferOutputType<
    (typeof cfg.outputs)['out1'],
    typeof args,
    unknown
  >;
  expect(out1).toEqual('hi');

  const computable2 = computableFromCfgUnsafe(
    {} as MiddleLayerDriverKit,
    ctx,
    cfg.outputs['out2'] as TypedConfig
  );
  const out2 = await computable2.getValue();
  expect(out2).toStrictEqual([{ theField: 'a' }, { theField: 'b' }, { theField: 'c' }]);
});

type TestResourceValue = {
  someField: number;
};

test('cfg test with pl, simple', async () => {
  const input = {
    theC: 'c'
  };
  const theCValue = getJsonField(Args, 'theC');

  const cfg = (
    BlockModel.create<typeof input>('Heavy')
      .initialArgs(input)
      .output(
        'out1',
        getJsonField(
          getResourceValueAsJson<TestResourceValue>()(getResourceField(MainOutputs, theCValue)),
          'someField'
        )
      )
      .done() as any
  ).config as BlockConfig;

  await TestHelpers.withTempRoot(async (pl) => {
    const tree = await SynchronizedTreeState.init(pl, pl.clientRoot, {
      pollingInterval: 250,
      stopPollingDelay: 500
    });

    const ctx = {
      $args: input,
      $prod: tree.entry() as any as PlResourceEntry
    };

    const computable: Computable<unknown> = computableFromCfgUnsafe(
      {} as MiddleLayerDriverKit,
      ctx,
      cfg.outputs['out1'] as TypedConfig
    ) as any;

    expect(await computable.getValue()).toBeUndefined();

    await pl.withWriteTx('addingTestResource', async (tx) => {
      tx.createField(
        field(pl.clientRoot, 'c'),
        'Dynamic',
        tx.createValue(Pl.JsonObject, JSON.stringify({ someField: 42 } as TestResourceValue))
      );
      await tx.commit();
    });

    await computable.refreshState();

    expect(await computable.getValue()).toEqual(42);
  });
});
