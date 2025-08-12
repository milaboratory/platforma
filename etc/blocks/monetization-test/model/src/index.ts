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
  shouldAddRunPerFile: boolean;
  __mnzDate: string;
  __mnzCanRun: boolean;
};

export const model = BlockModel.create()
  .withArgs<BlockArgs>({
    // a fake product key so our mnz client response with a fake response without changing prod db.
    productKey: "PRODUCT:XTOKAYPLQDZWSPPUTFNHPAJQQZKKSPTCDOORHFJIOYICTRDA",
    inputHandles: [],
    shouldAddRunPerFile: false,
    __mnzDate: new Date().toISOString(), // It's OK
    __mnzCanRun: false,
  })

  .argsValid((ctx) => {
    return ctx.args.__mnzCanRun;
  })

  .output('__mnzInfo', (ctx) => ctx.prerun?.resolve('info')?.getDataAsJson<unknown>())
  
  .output('tokens', (ctx) =>  ctx.outputs?.resolve('token')?.listInputFields().map((field) => {
    return {
      name: field,
      value: ctx.outputs?.resolve('token', field)?.getDataAsString()
    } as {
      name: string,
      value: string
    }
  }))

  .output('progresses', (ctx) => {
    const m = ctx.prerun?.resolve('progresses');
    const progresses = m?.mapFields((name, val) => [name, val?.getImportProgress()])
    return Object.fromEntries(progresses ?? []) as Record<string, ImportProgress>;
  })

  .output('mainProgresses', (ctx) => {
    const m = ctx.outputs?.resolve('progresses');
    const progresses = m?.mapFields((name, val) => [name, val?.getImportProgress()])
    return Object.fromEntries(progresses ?? []) as Record<string, ImportProgress>;
  })

  .sections((_) => [{ type: 'link', href: '/', label: 'Main' }])

  .done(2);

export type BlockOutputs = InferOutputsType<typeof model>;
