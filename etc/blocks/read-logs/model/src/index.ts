import {
  BlockModel,
  getImportProgress,
  getLastLogs,
  getLogHandle,
  getOnDemandBlobContent,
  getProgressLog,
  getProgressLogWithInfo,
  getResourceField,
  getResourceValueAsJson,
  ImportFileHandle,
  InferHrefType,
  InferOutputsType,
  MainOutputs
} from '@platforma-sdk/model';
import { z } from 'zod';

export const ImportFileHandleSchema = z
  .string()
  .optional()
  .refine<ImportFileHandle | undefined>(
    ((a) => true) as (arg: string | undefined) => arg is ImportFileHandle | undefined
  );

export const BlockArgs = z.object({
  inputHandle: ImportFileHandleSchema,
  readFileWithSleepArgs: z.string()
});

export type BlockArgs = z.infer<typeof BlockArgs>;

export const platforma = BlockModel.create('Heavy')

  .withArgs({
    inputHandle: undefined,
    readFileWithSleepArgs: 'PREFIX,5,1000'
  })

  .output('handle', getImportProgress(getResourceField(MainOutputs, 'handle')))

  .output('lastLogs', getLastLogs(getResourceField(MainOutputs, 'log'), 10))

  .output('progressLog', getProgressLog(getResourceField(MainOutputs, 'log'), 'PREFIX'))

  .output('progressLogWithInfo', getProgressLogWithInfo(getResourceField(MainOutputs, 'log'), 'PREFIX'))

  .output('progressLogWithInfoCtx', (ctx) => ctx.outputs?.resolve('log')?.getProgressLogWithInfo('PREFIX'))

  .output('logHandle', getLogHandle(getResourceField(MainOutputs, 'log')))

  .sections((ctx) => {
    return [{ type: 'link', href: '/', label: 'Main' }];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
