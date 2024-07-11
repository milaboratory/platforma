import {
  AnyRef,
  field,
  FieldRef,
  Pl,
  PlClient,
  PlTransaction,
  ResourceId,
  toGlobalResourceId,
  TreeNodeAccessor,
  prepareTemplateSpec,
  loadTemplate,
  createRenderTemplate
} from '@milaboratory/pl-middle-layer';
import { plTest } from './test-pl';
import {
  PlTreeEntry,
  PlTreeNodeAccessor,
  SynchronizedTreeState
} from '@milaboratory/pl-tree';
import {
  Computable,
  ComputableCtx,
  UnwrapComputables
} from '@milaboratory/computable';
import { randomUUID } from 'node:crypto';

export class TestRenderResults<O extends string> {
  constructor(
    public readonly fields: Readonly<Record<O, FieldRef>>,
    public readonly resultEntry: PlTreeEntry
  ) {}

  public computeOutput<R>(
    name: O,
    cb: (acc: PlTreeNodeAccessor | undefined, ctx: ComputableCtx) => R
  ): Computable<UnwrapComputables<R> | undefined> {
    return Computable.make((ctx) => {
      const outputAccessor = ctx
        .accessor(this.resultEntry)
        .node()
        .traverse(name);
      if (outputAccessor === undefined) {
        ctx.markUnstable();
        return undefined;
      }
      return cb(outputAccessor, ctx);
    });
  }
}

export class TplTestHelpers {
  constructor(
    private readonly pl: PlClient,
    private readonly resultRootRid: ResourceId,
    private readonly resultRootTree: SynchronizedTreeState
  ) {}

  async renderTemplate<const O extends string>(
    ephemeral: boolean,
    templateName: string,
    outputs: O[],
    inputs: (
      tx: PlTransaction
    ) => Record<string, AnyRef> | Promise<Record<string, AnyRef>>
  ): Promise<TestRenderResults<O>> {
    const runId = randomUUID();
    const spec = await prepareTemplateSpec({
      type: 'from-file',
      path: `./dist/tengo/tpl/${templateName}.plj.gz`
    });
    const { resultMapRid, resultFields } = await this.pl.withWriteTx(
      'TemplateRender',
      async (tx) => {
        const tpl = loadTemplate(tx, spec);
        const renderedInputs = await inputs(tx);
        // prettier-ignore
        const futureOutputs = await createRenderTemplate(
        tx, tpl, ephemeral, renderedInputs, outputs);
        const resultMap = Pl.createPlMap(tx, futureOutputs, ephemeral);
        tx.createField(field(this.resultRootRid, runId), 'Dynamic', resultMap);
        const resultMapRid = await toGlobalResourceId(resultMap);
        await tx.commit();
        return {
          resultMapRid,
          resultFields: Object.fromEntries(
            outputs.map((o) => [o, field(resultMapRid, o)])
          ) as Record<O, FieldRef>
        };
      }
    );
    await this.resultRootTree.refreshState();
    return new TestRenderResults(
      resultFields,
      this.resultRootTree.entry(resultMapRid)
    );
  }
}

export const tplTest = plTest.extend<{
  helper: TplTestHelpers;
}>({
  helper: async ({ pl, createTree }, use) => {
    const resultMap = await pl.withWriteTx('CreatingHelpers', async (tx) => {
      const map = tx.createEphemeral(Pl.EphStdMap);
      const rootField = field(tx.clientRoot, 'templateTeste');
      tx.createField(rootField, 'Dynamic', map);
      await tx.commit();
      return await toGlobalResourceId(map);
    });
    const resultMapTree = await createTree(resultMap);
    await use(new TplTestHelpers(pl, resultMap, resultMapTree));
  }
});
