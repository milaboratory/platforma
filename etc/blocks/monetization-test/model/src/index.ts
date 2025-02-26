import { BlockModel, ImportFileHandle, InferOutputsType } from '@platforma-sdk/model';

export type BlockArgs = {
  commandToMonetize: string[];
  productKey: string;
  // inputHandles: (ImportFileHandle | undefined)[];
};

export const model = BlockModel.create()
  .withArgs({
    commandToMonetize: ["/usr/bin/env", "bash", "-c", "echo -n $PLATFORMA_MNZ_JWT"],
    // a fake product key so our mnz client response with a fake response without changing prod db.
    productKey: "MIFAKEMIFAKEMIFAKE",
  })

  .output('info', (ctx) => ctx.prerun?.resolve('info')?.getDataAsJson<unknown>())

  .output('stdout', (ctx) => ctx.outputs?.resolve('stdout')?.getDataAsString())

  .sections((_) => [{ type: 'link', href: '/', label: 'Main' }])

  .done();

export type BlockOutputs = InferOutputsType<typeof model>;
