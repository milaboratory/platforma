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
  TemplateSpecAny,
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

export type WorkflowRenderOps = {
  parent?: ResourceId;
  exportProcessor?: TemplateSpecAny;
};

export class TestRenderResults<O extends string> {
  constructor(public readonly resultEntry: PlTreeEntry) {}

  public computeOutput<R>(
    name: O,
    cb: (acc: PlTreeNodeAccessor | undefined, ctx: ComputableCtx) => R
  ): Computable<UnwrapComputables<R> | undefined> {
    return Computable.make((ctx) => {
      const outputAccessor = ctx
        .accessor(this.resultEntry)
        .node()
        .traverse({ field: name, assertFieldType: 'Input' });
      return cb(outputAccessor, ctx);
    });
  }
}

export class TestWorkflowResults {
  constructor(
    public readonly renderResult: TestRenderResults<'context' | 'result'>,
    public readonly processedExportsResult: TestRenderResults<'result'> | undefined,
    public readonly blockId: string
  ) {}

  /**
   * Returns context id of this workflow
   * */
  public context(): ComputableStableDefined<ResourceId> {
    return this.renderResult
      .computeOutput('context', (cb) => cb?.id)
      .withStableType();
  }

  /**
   * Returns context id of this workflow
   * */
  public result(): ComputableStableDefined<ResourceId> {
    return this.renderResult
      .computeOutput('result', (cb) => cb?.id)
      .withStableType();
  }

  public export<R>(
    name: string,
    cb: (acc: PlTreeNodeAccessor | undefined, ctx: ComputableCtx) => R
  ) {
    if (this.processedExportsResult !== undefined)
      return this.processedExportsResult.computeOutput('result', (acc, ctx) => {
        return cb(
          acc?.traverse({ field: name, assertFieldType: 'Input' }),
          ctx
        );
      });
    else
      return this.renderResult.computeOutput('context', (acc, ctx) => {
        return cb(
          acc?.traverse({ field: `values/${name}`, assertFieldType: 'Input' }),
          ctx
        );
      });
  }

  public output<R>(
    name: string,
    cb: (acc: PlTreeNodeAccessor | undefined, ctx: ComputableCtx) => R
  ) {
    return this.renderResult.computeOutput('result', (acc, ctx) => {
      return cb(acc?.traverse({ field: name, assertFieldType: 'Input' }), ctx);
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
    template: string | TemplateSpecAny,
    outputs: O[],
    inputs: (
      tx: PlTransaction
    ) => Record<string, AnyRef> | Promise<Record<string, AnyRef>>
  ): Promise<TestRenderResults<O>> {
    const runId = randomUUID();
    const spec =
      typeof template === 'string'
        ? await prepareTemplateSpec({
            type: 'from-file',
            path: `./dist/tengo/tpl/${template}.plj.gz`
          })
        : await prepareTemplateSpec(template);
    const { resultMapRid } = await this.pl.withWriteTx(
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
          resultMapRid
        };
      }
    );
    await this.resultRootTree.refreshState();
    return new TestRenderResults(this.resultRootTree.entry(resultMapRid));
  }

  createObject(tx: PlTransaction, value: any) {
    return tx.createValue(Pl.JsonObject, JSON.stringify(value));
  }

  async renderWorkflow(
    workflow: string | TemplateSpecAny,
    preRun: boolean,
    args: Record<string, any> | Promise<Record<string, any>>,
    ops: WorkflowRenderOps = {}
  ): Promise<TestWorkflowResults> {
    const blockId = randomUUID();
    const mainResult: TestRenderResults<'result' | 'context'> =
      await this.renderTemplate(true, workflow, ['result', 'context'], (tx) => {
        let ctx = undefined;
        if (ops.parent) {
          ctx = ops.parent;
        } else {
          ctx = tx.createEphemeral({ name: 'BContextEnd', version: '1' });
          tx.lock(ctx);
        }

        return {
          args: this.createObject(tx, args),
          blockId: this.createObject(tx, blockId),
          isProduction: this.createObject(tx, !preRun),
          context: ctx
        };
      });

    const exports: TestRenderResults<'exports'> | undefined = undefined;
    if(ops.exportProcessor !== undefined){
      const exports = await this.renderTemplate(true, ops.exportProcessor, ['result'], (tx) => {
        let ctx = undefined;
        if (ops.parent) {
          ctx = ops.parent;
        } else {
          ctx = tx.createEphemeral({ name: 'BContextEnd', version: '1' });
          tx.lock(ctx);
        }

        return {
          args: this.createObject(tx, args),
          blockId: this.createObject(tx, blockId),
          isProduction: this.createObject(tx, !preRun),
          context: ctx
        };
      });
    }

    return new TestWorkflowResults(mainResult, exports, blockId);
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
