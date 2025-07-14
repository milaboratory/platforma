import { field, Pl } from '@milaboratories/pl-middle-layer';
import { tplTest } from '@platforma-sdk/test';

tplTest.concurrent('anonimizeFields simple test', async ({ helper, expect }) => {
  const renderAnonymize = async (target: Record<string, string>) => {
    const result = await helper.renderTemplate(
      true,
      'anonymize.apply-anonymize-fields',
      ['result'],
      (tx) => {
        const targetRef = tx.createStruct({ name: 'Test', version: '1' });
        for (const [key, value] of Object.entries(target)) {
          tx.createField(field(targetRef, key), 'Input', tx.createValue(Pl.JsonObject, JSON.stringify({ value })));
        }
        tx.lock(targetRef);
        return {
          target: targetRef,
          params: tx.createJsonValue({}),
        };
      },
    );
    return result.computeOutput('result', (a) => a?.listInputFields());
  };

  const values = {
    valA: 'value-a',
    valB: 'value-b',
  };

  const target1 = {
    field1: values.valA,
    field2: values.valB,
  };

  const target2 = {
    anotherField1: values.valA,
    anotherField2: values.valB,
  };

  const result1Fields = await (await renderAnonymize(target1)).awaitStableValue();
  const result2Fields = await (await renderAnonymize(target2)).awaitStableValue();

  expect(result1Fields).toBeDefined();
  expect(result2Fields).toBeDefined();
  expect(result1Fields!.sort()).toEqual(result2Fields!.sort());
});

tplTest.concurrent('anonimizePKeys simple test', async ({ helper, expect }) => {
  const renderAnonymizePKeys = async (target: Record<string, unknown>, pKeyIndices: number[]) => {
    const result = await helper.renderTemplate(
      true,
      'anonymize.apply-anonymize-pkeys',
      ['result', 'mapping'],
      (tx) => {
        const targetRef = tx.createStruct({ name: 'TestPkeys', version: '1' });
        for (const [key, value] of Object.entries(target)) {
          tx.createField(field(targetRef, key), 'Input', tx.createValue(Pl.JsonObject, JSON.stringify(value)));
        }
        tx.lock(targetRef);
        return {
          target: targetRef,
          pKeyIndices: tx.createValue(Pl.JsonObject, JSON.stringify(pKeyIndices)),
        };
      },
    );
    return {
      result: result.computeOutput('result', (a) => a?.listInputFields()),
      mapping: result.computeOutput('mapping', (a) => a?.getDataAsJson<Record<string, string>>()),
    };
  };

  const values = {
    valA: 'value-a',
    valB: 'value-b',
  };

  const createPColumnFields = (keyTuple: string[], value: string, index: string) => {
    const key = JSON.stringify(keyTuple);
    return {
      [`${key}.data`]: value,
      [`${key}.index`]: index,
    };
  };

  const target1 = {
    ...createPColumnFields(['user1', 'common', 'p1'], values.valA, 'index-a'),
    ...createPColumnFields(['user1', 'common', 'p2'], values.valB, 'index-b'),
  };

  const target2 = {
    ...createPColumnFields(['user2', 'common', 'p1'], values.valA, 'index-a'),
    ...createPColumnFields(['user2', 'common', 'p2'], values.valB, 'index-b'),
  };

  const pKeyIndicesToAnonymize = [0];

  const anonymizeResult1 = await renderAnonymizePKeys(target1, pKeyIndicesToAnonymize);
  const anonymizeResult2 = await renderAnonymizePKeys(target2, pKeyIndicesToAnonymize);

  const result1Fields = await anonymizeResult1.result.awaitStableValue();
  const result2Fields = await anonymizeResult2.result.awaitStableValue();

  const mapping1 = await anonymizeResult1.mapping.awaitStableValue();
  const mapping2 = await anonymizeResult2.mapping.awaitStableValue();

  expect(mapping1['user1']).toMatch(/.*-0/);
  expect(mapping2['user2']).toMatch(/.*-0/);

  expect(result1Fields).toBeDefined();
  expect(result2Fields).toBeDefined();
  expect(result1Fields!.sort()).toEqual(result2Fields!.sort());
});
