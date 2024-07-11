import {
  AnyRef,
  AnyResourceRef,
  field,
  isNotNullResourceId,
  isNullResourceId,
  PlClient,
  PlTransaction,
  ResourceData,
  ResourceId,
  TestHelpers,
  getField,
  valErr,
  Pl
} from '@milaboratory/pl-client-v2';
import { loadTemplate } from './template_loading';
import { createBContextEnd, createRenderHeavyBlock, HeavyBlockOutputs } from './render_block';
import { notEmpty, sleep } from '@milaboratory/ts-helpers';
import { TemplateSpecPrepared } from '../../model/template_spec';
import {
  TplSpecEnterExplicit,
  TplSpecEnterFromRegistry,
  TplSpecSumExplicit,
  TplSpecSumFromRegistry
} from '../../test/known_templates';
import { outputRef } from '../../model/args';

describe.each([
  { name: 'explicit', specEnter: TplSpecEnterExplicit, specSum: TplSpecSumExplicit },
  { name: 'from registry', specEnter: TplSpecEnterFromRegistry, specSum: TplSpecSumFromRegistry }
])('test render $name', ({ specEnter, specSum }) => {
  const args: {
    name: string;
    createBlocksFn: (tx: PlTransaction) => Promise<HeavyBlockOutputs>;
    expect: (pl: PlClient, tx: PlTransaction) => Promise<boolean>;
  }[] = [
    {
      name: 'test render template staging',
      createBlocksFn: async (tx) => {
        return createEnterNumbers(tx, specEnter, false, 'block1', createBContextEnd(tx), undefined);
      },

      expect: async (pl, tx) => {
        const { ctx, result, ok } = await expectResultAndContext(tx, pl.clientRoot);
        if (!ok) return false;

        expectFields(result!, ['dependsOnBlocks']);
        expectFields(ctx!, ['id', 'parent', 'values/column.spec']);
        expect(await expectData(tx, result!, 'dependsOnBlocks')).toStrictEqual([]);
        expect(await expectData(tx, ctx!, 'values/column.spec')).not.toBeUndefined();

        return true;
      }
    },
    {
      name: 'test render template production',
      createBlocksFn: async (tx) => {
        return createEnterNumbers(
          tx,
          specEnter,
          true,
          'block1',
          createBContextEnd(tx),
          [42, 2, 3, 7]
        );
      },
      expect: async (pl, tx) => {
        const { ctx, result, ok } = await expectResultAndContext(tx, pl.clientRoot);
        if (!ok) return false;

        expectFields(result!, ['dependsOnBlocks']);
        expectFields(ctx!, ['id', 'parent', 'values/column.spec', 'values/column.data']);
        expect(await expectData(tx, result!, 'dependsOnBlocks')).toStrictEqual([]);
        expect(await expectData(tx, ctx!, 'values/column.data')).toStrictEqual([42, 2, 3, 7]);

        return true;
      }
    },
    {
      name: 'test render chain staging',
      createBlocksFn: async (tx) => {
        const enter1 = createEnterNumbers(
          tx,
          specEnter,
          false,
          'block1',
          createBContextEnd(tx),
          undefined
        );
        const enter2 = createEnterNumbers(
          tx,
          specEnter,
          false,
          'block2',
          enter1.context,
          undefined
        );
        return createSumNumbers(tx, specSum, false, 'block3', enter2.context, undefined);
      },

      expect: async (pl, tx) => {
        const { ctx, result, ok } = await expectResultAndContext(tx, pl.clientRoot);
        if (!ok) return false;

        expectFields(result!, ['dependsOnBlocks', 'opts']);
        expectFields(ctx!, ['id', 'parent']);
        expect(await expectData(tx, result!, 'opts')).toStrictEqual([
          {
            label: 'block1 / column',
            ref: { blockId: 'block1', name: 'column' }
          },
          {
            label: 'block2 / column',
            ref: { blockId: 'block2', name: 'column' }
          }
        ]);

        return true;
      }
    },
    {
      name: 'test render chain production',
      createBlocksFn: async (tx) => {
        const enter1 = createEnterNumbers(tx, specEnter, true, 'block1', createBContextEnd(tx), [
          21
        ]);
        const enter2 = createEnterNumbers(tx, specEnter, true, 'block2', enter1.context, [10, 11]);
        return createSumNumbers(tx, specSum, true, 'block3', enter2.context, [
          outputRef('block1', 'column'), //{ blockId: 'block1', name: 'column' },
          outputRef('block2', 'column') //{ blockId: 'block2', name: 'column' }
        ]);
      },

      expect: async (pl, tx) => {
        const { ctx, result, ok } = await expectResultAndContext(tx, pl.clientRoot);
        if (!ok) return false;

        expectFields(result!, ['dependsOnBlocks', 'sum']);
        expectFields(ctx!, ['id', 'parent']);
        expect(await expectData(tx, result!, 'sum')).toBe(42);

        return true;
      }
    }
  ];

  for (const arg of args) {
    test(
      arg.name,
      async () => {
        await TestHelpers.withTempRoot(async (pl) => {
          const f0 = field(pl.clientRoot, 'result');
          const f1 = field(pl.clientRoot, 'context');

          await pl.withWriteTx('test', async (tx) => {
            const b = await arg.createBlocksFn(tx);
            tx.createField(f0, 'Dynamic', b.result);
            tx.createField(f1, 'Dynamic', b.context);
            await tx.commit();
          });

          while (true) {
            if (await pl.withReadTx('test', (tx) => arg.expect(pl, tx))) break;

            await sleep(30);
          }
        });
      },
      5000
    );
  }
});

function createEnterNumbers(
  tx: PlTransaction,
  template: TemplateSpecPrepared,
  isProd: boolean,
  blockIdData: string,
  ctx: AnyRef,
  numbers?: number[]
) {
  const tpl = loadTemplate(tx, template);

  const args = tx.createValue(Pl.JsonObject, jsonToData({ numbers: numbers ?? [] }));
  const blockId = tx.createValue(Pl.JsonString, jsonToData(blockIdData));
  const isProduction = Pl.createPlBool(tx, isProd);

  return createRenderHeavyBlock(tx, tpl, {
    args: args,
    blockId: blockId,
    isProduction: isProduction,
    context: ctx
  });
}

interface Ref {
  blockId: string;
  name: string;
}

function createSumNumbers(
  tx: PlTransaction,
  template: TemplateSpecPrepared,
  isProd: boolean,
  blockIdData: string,
  ctx: AnyRef,
  sources?: Ref[]
) {
  const tpl = loadTemplate(tx, template);

  const args = tx.createValue(Pl.JsonObject, jsonToData({ sources: sources }));
  const blockId = tx.createValue(Pl.JsonString, jsonToData(blockIdData));
  const isProduction = Pl.createPlBool(tx, isProd);

  return createRenderHeavyBlock(tx, tpl, {
    args: args,
    blockId: blockId,
    isProduction: isProduction,
    context: ctx
  });
}

async function expectResultAndContext(
  tx: PlTransaction,
  root: AnyResourceRef
): Promise<{
  ctx?: ResourceData;
  result?: ResourceData;
  ok: boolean;
}> {
  const fieldData = await tx.getResourceData(root, true);
  expect(isNullResourceId(fieldData.error)).toBe(true);
  expectFields(fieldData, ['context', 'result']);

  const ctxField = await valErr(tx, getField(fieldData, 'context'));
  expect(ctxField.error).toHaveLength(0);
  const resultField = await valErr(tx, getField(fieldData, 'result'));
  expect(resultField.error).toHaveLength(0);

  const ctxId = ctxField.valueId;
  const resultId = resultField.valueId;

  if (isNullResourceId(ctxId) || isNullResourceId(resultId)) return { ok: false };

  const result = await tx.getResourceData(resultId, true);
  const ctx = await tx.getResourceData(ctxId, true);

  if (!result.final || !ctx.final) return { ok: false };

  return { ctx, result, ok: true };
}

async function expectResource(tx: PlTransaction, res: ResourceData, fieldName: string) {
  const f = getField(res, fieldName);
  const ve = await valErr(tx, f);
  expect(ve.error).toHaveLength(0);
  expect(isNotNullResourceId(ve.valueId)).toBeTruthy();
  return await tx.getResourceData(ve.valueId as ResourceId, true);
}

async function expectData(tx: PlTransaction, result: ResourceData, fieldName: string) {
  return expectResource(tx, result, fieldName).then(resDataToJson);
}

function expectFields(res: ResourceData, fields: string[]) {
  const names = res.fields.map((f) => f.name);
  expect(names.sort()).toStrictEqual(fields.sort());
}

const jsonToData = (data: unknown) => Buffer.from(JSON.stringify(data));

const resDataToJson = (res: ResourceData) => JSON.parse(notEmpty(res.data).toString());
