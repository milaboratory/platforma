import { BlockModel, ImportFileHandle, ImportProgress, InferOutputsType } from '@platforma-sdk/model';

export type Handle = {
  handle: ImportFileHandle | undefined;
  fileName: string;
  argName: string;
  options: string[];
}

export type BlockArgs = {
  productKey: string;
  inputHandles: Handle[];
  monetizationDate: string;
};

export const model = BlockModel.create()
  .withArgs<BlockArgs>({
    // a fake product key so our mnz client response with a fake response without changing prod db.
    productKey: "MIFAKEMIFAKEMIFAKE",
    inputHandles: [],
    monetizationDate: "Mon 2 Apr 15:28:10 CET 2025",
  })

  .output('info', (ctx) => ctx.prerun?.resolve('info')?.getDataAsJson<unknown>())

  .output('token', (ctx) => ctx.outputs?.resolve('token')?.getDataAsString())

  .output('progresses', (ctx) => {
    const m = ctx.prerun?.resolve('progresses');
    const progresses = m?.mapFields((name, val) => [name, val?.getImportProgress()])
    return Object.fromEntries(progresses ?? []);
  })

  .output('mainProgresses', (ctx) => {
    const m = ctx.outputs?.resolve('progresses');
    const progresses = m?.mapFields((name, val) => [name, val?.getImportProgress()])
    return Object.fromEntries(progresses ?? []);
  })

  .sections((_) => [{ type: 'link', href: '/', label: 'Main' }])

  .done();

export type BlockOutputs = InferOutputsType<typeof model>;
