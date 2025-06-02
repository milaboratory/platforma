import type { ResourceId } from '@milaboratories/pl-middle-layer';
import { field, Pl, resourceType, toGlobalResourceId } from '@milaboratories/pl-middle-layer';
import { awaitStableState, tplTest } from '@platforma-sdk/test';
import { Templates as SdkTemplates } from '@platforma-sdk/workflow-tengo';

tplTest.concurrent.for([
  { isEph: true, name: 'ephemeral mode' },
  { isEph: false, name: 'pure mode' },
])(
  'should correctly execute pframes.remove-nulls ($name)',
  async ({ isEph }, { helper, expect }) => {
    const result = await helper.renderTemplate(
      isEph,
      SdkTemplates['pframes.remove-nulls'],
      ['result'],
      (tx) => {
        const inputMap = tx.createStruct(
          resourceType('PColumnData/ResourceMap', '1'),
          JSON.stringify({
            keyLength: 1,
          }),
        );
        tx.createField(field(inputMap, '[1]'), 'Input', tx.createValue(Pl.JsonObject, JSON.stringify({ a: 1 })));
        tx.createField(field(inputMap, '[2]'), 'Input', tx.createValue(Pl.RNull, ''));
        tx.createField(field(inputMap, '[3]'), 'Input', tx.createValue(Pl.JsonObject, JSON.stringify({ a: 3 })));
        tx.lockInputs(inputMap);
        return { map: inputMap };
      },
    );

    const resultMapLength = await awaitStableState(result.computeOutput('result', (a) => {
      const fields = a?.listInputFields();
      return Object.fromEntries(fields?.map((f) => [f, a?.traverse(f)?.getDataAsJson()]) ?? []);
    }));
    expect(resultMapLength).toStrictEqual({
      '[1]': { a: 1 },
      '[3]': { a: 3 },
    });
  },
);

tplTest.concurrent.for([
  { isEph: true, name: 'ephemeral mode' },
  { isEph: false, name: 'pure mode' },
])(
  'should correctly execute pframes.remove-nulls with all nulls($name)',
  async ({ isEph }, { helper, expect }) => {
    const result = await helper.renderTemplate(
      isEph,
      SdkTemplates['pframes.remove-nulls'],
      ['result'],
      (tx) => {
        const inputMap = tx.createStruct(
          resourceType('PColumnData/ResourceMap', '1'),
          JSON.stringify({
            keyLength: 1,
          }),
        );
        tx.createField(field(inputMap, '[1]'), 'Input', tx.createValue(Pl.RNull, ''));
        tx.createField(field(inputMap, '[2]'), 'Input', tx.createValue(Pl.RNull, ''));
        tx.createField(field(inputMap, '[3]'), 'Input', tx.createValue(Pl.RNull, ''));
        tx.lockInputs(inputMap);
        return { map: inputMap };
      },
    );

    const resultMapLength = await awaitStableState(result.computeOutput('result', (a) => {
      const fields = a?.listInputFields();
      return Object.fromEntries(fields?.map((f) => [f, a?.traverse(f)?.getDataAsJson()]) ?? []);
    }));
    expect(resultMapLength).toStrictEqual({});
  },
);

tplTest.concurrent.for([
  { isEph: true, name: 'ephemeral mode' },
  { isEph: false, name: 'pure mode' },
])(
  'should correctly execute pframes.remove-nulls delayed 1 ($name)',
  async ({ isEph }, { helper, pl, expect }) => {
    let theMap: ResourceId | undefined = undefined;
    const result = await helper.renderTemplate(
      isEph,
      SdkTemplates['pframes.remove-nulls'],
      ['result'],
      async (tx) => {
        const inputMap = tx.createStruct(
          resourceType('PColumnData/ResourceMap', '1'),
          JSON.stringify({
            keyLength: 1,
          }),
        );
        theMap = await toGlobalResourceId(inputMap);
        tx.createField(field(inputMap, '[1]'), 'Input', tx.createValue(Pl.JsonObject, JSON.stringify({ a: 1 })));
        tx.createField(field(inputMap, '[2]'), 'Input', tx.createValue(Pl.RNull, ''));
        return { map: inputMap };
      },
    );

    pl.withWriteTx('setKeys', async (tx) => {
      tx.createField(field(theMap!, '[3]'), 'Input', tx.createValue(Pl.JsonObject, JSON.stringify({ a: 3 })));
      tx.createField(field(theMap!, '[4]'), 'Input', tx.createValue(Pl.RNull, ''));
      tx.lockInputs(theMap!);
      await tx.commit();
    });

    const resultMapLength = await awaitStableState(result.computeOutput('result', (a) => {
      const fields = a?.listInputFields();
      return Object.fromEntries(fields?.map((f) => [f, a?.traverse(f)?.getDataAsJson()]) ?? []);
    }));
    expect(resultMapLength).toStrictEqual({
      '[1]': { a: 1 },
      '[3]': { a: 3 },
    });
  },
);

tplTest.concurrent.for([
  { isEph: true, name: 'ephemeral mode' },
  { isEph: false, name: 'pure mode' },
])(
  'should correctly execute pframes.remove-nulls delayed 2 ($name)',
  async ({ isEph }, { helper, pl, expect }) => {
    let theMap: ResourceId | undefined = undefined;
    const result = await helper.renderTemplate(
      isEph,
      SdkTemplates['pframes.remove-nulls'],
      ['result'],
      async (tx) => {
        const inputMap = tx.createStruct(
          resourceType('PColumnData/ResourceMap', '1'),
          JSON.stringify({
            keyLength: 1,
          }),
        );
        theMap = await toGlobalResourceId(inputMap);
        tx.createField(field(inputMap, '[1]'), 'Input', tx.createValue(Pl.JsonObject, JSON.stringify({ a: 1 })));
        tx.createField(field(inputMap, '[2]'), 'Input', tx.createValue(Pl.RNull, ''));
        tx.createField(field(inputMap, '[3]'), 'Input');
        tx.createField(field(inputMap, '[4]'), 'Input', tx.createValue(Pl.RNull, ''));
        tx.lockInputs(inputMap);
        return { map: inputMap };
      },
    );

    pl.withWriteTx('setKeys', async (tx) => {
      tx.setField(field(theMap!, '[3]'), tx.createValue(Pl.JsonObject, JSON.stringify({ a: 3 })));
      await tx.commit();
    });

    const resultMapLength = await awaitStableState(result.computeOutput('result', (a) => {
      const fields = a?.listInputFields();
      return { type: a?.resourceType, data: Object.fromEntries(fields?.map((f) => [f, a?.traverse(f)?.getDataAsJson()]) ?? []) };
    }));
    expect(resultMapLength).toStrictEqual({
      type: { name: 'PColumnData/ResourceMap', version: '1' },
      data: {
        '[1]': { a: 1 },
        '[3]': { a: 3 },
      },
    });
  },
);
