import {
  Computable,
  ComputableCtx,
  ComputableStableDefined,
  UnwrapComputables
} from '@milaboratory/computable';
import {
  AnyRef,
  createRenderTemplate,
  field,
  FieldRef,
  initDriverKit,
  loadTemplate,
  MiddleLayer,
  MiddleLayerDriverKit,
  Pl,
  PlClient,
  PlTransaction,
  prepareTemplateSpec,
  ResourceId,
  toGlobalResourceId
} from '@milaboratory/pl-middle-layer';
import {
  PlTreeEntry,
  PlTreeNodeAccessor,
  SynchronizedTreeState
} from '@milaboratory/pl-tree';
import { ConsoleLoggerAdapter } from '@milaboratory/ts-helpers';
import { randomUUID } from 'node:crypto';
import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { plTest } from './test-pl';

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

export class TestWorkflowResults {
  constructor(
    public readonly renderResult: TestRenderResults<'context' | 'result'>,
    public readonly blockId: string
  ) {}

  /** Returns context id of this workflow */
  public context(): ComputableStableDefined<ResourceId> {
    return this.renderResult
      .computeOutput('context', (cb) => cb?.id)
      .withStableType();
  }

  /** Returns context id of this workflow */
  public result(): ComputableStableDefined<ResourceId> {
    return this.renderResult
      .computeOutput('result', (cb) => cb?.id)
      .withStableType();
  }

  public export<R>(
    name: string,
    cb: (acc: PlTreeNodeAccessor | undefined, ctx: ComputableCtx) => R
  ) {
    return this.renderResult.computeOutput('context', (xcb, xctx) => {
      return cb(xcb?.getField(`values/${name}`)?.value, xctx);
    });
  }

  public output<R>(
    name: string,
    cb: (acc: PlTreeNodeAccessor | undefined, ctx: ComputableCtx) => R
  ) {
    return this.renderResult.computeOutput('result', (xcb, xctx) => {
      return cb(xcb?.getField(name)?.value, xctx);
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

  createObject(tx: PlTransaction, value: any) {
    return tx.createValue(Pl.JsonObject, JSON.stringify(value));
  }

  async renderWorkflow(
    workflowName: string,
    preRun: boolean,
    args: Record<string, any> | Promise<Record<string, any>>,
    parent?: ResourceId
  ): Promise<TestWorkflowResults> {
    const blockId = randomUUID();
    const result: TestRenderResults<'result' | 'context'> =
      await this.renderTemplate(
        true,
        workflowName,
        ['result', 'context'],
        (tx) => {
          let ctx = undefined;
          if (parent) {
            ctx = parent;
          } else {
            ctx = tx.createEphemeral({ name: 'BContextEnd', version: '1' });
            tx.lockInputs(ctx);
            tx.lockOutputs(ctx);
          }

          return {
            args: this.createObject(tx, args),
            blockId: this.createObject(tx, blockId),
            isProduction: this.createObject(tx, !preRun),
            context: ctx
          };
        }
      );

    return new TestWorkflowResults(result, blockId);
  }
}

export const tplTest = plTest.extend<{
  helper: TplTestHelpers;
  driverKit: MiddleLayerDriverKit;
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
  },
  driverKit: async ({ pl, tmpFolder }, use) => {
    const downloadFolder = path.join(tmpFolder, 'download');
    await fsp.mkdir(downloadFolder, { recursive: true });
    const driverKit = await initDriverKit(pl, new ConsoleLoggerAdapter(), {
      blobDownloadPath: downloadFolder,
      localSecret: MiddleLayer.generateLocalSecret()
    });

    await use(driverKit);
  }
});
