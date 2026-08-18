import type { ImportFileHandle, InferHrefType, InferOutputsType } from "@platforma-sdk/model";
import { BlockModelV3, DataModelBuilder } from "@platforma-sdk/model";
import { kind } from "@milaboratories/milaboratories.test-read-logs.kind";
import { z } from "zod";

export const ImportFileHandleSchema = z
  .string()
  .optional()
  .refine<ImportFileHandle | undefined>(
    ((_a) => true) as (arg: string | undefined) => arg is ImportFileHandle | undefined,
  );

export const BlockData = z.object({
  inputHandle: ImportFileHandleSchema,
  readFileWithSleepArgs: z.string(),
});

export type BlockData = z.infer<typeof BlockData>;

/** What the workflow consumes — projected from {@link BlockData} by the args lambda. */
export type BlockArgs = {
  inputHandle: ImportFileHandle | undefined;
  readFileWithSleepArgs: string;
};

// This block takes no init params (its kind declares `Record<string, never>`):
// `inputHandle` is a desktop-signed `ImportFileHandle` no template can pre-wire,
// and `readFileWithSleepArgs` is a fixture knob. So `init` ignores params and
// returns the defaults.
const dataModel = new DataModelBuilder({ kind })
  .from<BlockData>("v1")
  .init(() => ({ inputHandle: undefined, readFileWithSleepArgs: "PREFIX,5,1000" }));

export const platforma = BlockModelV3.create({ dataModel, kind })

  .args<BlockArgs>((data) => ({
    inputHandle: data.inputHandle,
    readFileWithSleepArgs: data.readFileWithSleepArgs,
  }))

  // Nothing to project: the kind takes no params. `inputHandle` is a signed,
  // session-local reference, and `readFileWithSleepArgs` is a fixture knob driven from
  // the UI rather than something a template would pre-wire.
  .templateParams(() => ({}))

  .output("handle", (ctx) => ctx.outputs?.resolve("handle")?.getImportProgress())

  .output("lastLogs", (ctx) => ctx.outputs?.resolve("log")?.getLastLogs(10))

  .output("progressLog", (ctx) => ctx.outputs?.resolve("log")?.getProgressLog("PREFIX"))

  // V1 declared this twice — once through the config-based
  // `getProgressLogWithInfo(getResourceField(MainOutputs, "log"), …)` helper and
  // once as a `ctx` lambda (`progressLogWithInfoCtx`), so the block covered both
  // surfaces. `BlockModelV3.output()` takes render lambdas only, so the two
  // collapse into this single output.
  .output("progressLogWithInfo", (ctx) =>
    ctx.outputs?.resolve("log")?.getProgressLogWithInfo("PREFIX"),
  )

  .output("logHandle", (ctx) => ctx.outputs?.resolve("log")?.getLogHandle())

  .sections((_ctx) => {
    return [{ type: "link", href: "/", label: "Main" }];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
