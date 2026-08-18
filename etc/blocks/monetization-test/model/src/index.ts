import type { ImportFileHandle, InferHrefType, InferOutputsType } from "@platforma-sdk/model";
import { BlockModelV3, DataModelBuilder } from "@platforma-sdk/model";
import { kind } from "@milaboratories/milaboratories.monetization-test.kind";

export type Handle = {
  handle: ImportFileHandle | undefined;
  fileName: string;
  argName: string;
  options: string[];
};

export type BlockData = {
  productKey: string;
  inputHandles: Handle[];
  shouldAddRunPerFile: boolean;
  /**
   * Both `__mnz*` fields are written by the SDK's monetization plugin
   * (`sdk/ui-vue/src/plugins/Monetization/useInfo.ts`) straight into
   * `app.model.data` by literal key, so they must stay top-level here.
   *
   * `__mnzDate` is re-stamped every 60s to refresh the monetization info, and
   * `__mnzCanRun` mirrors the `canRun` verdict that info carries.
   */
  __mnzDate: string;
  __mnzCanRun: boolean;
};

/** What the main workflow consumes — projected from {@link BlockData} by the args lambda. */
export type BlockArgs = {
  productKey: string;
  inputHandles: Handle[];
  shouldAddRunPerFile: boolean;
};

/** What the pre-run consumes: the same inputs plus the monetization timestamp. */
export type BlockPrerunArgs = BlockArgs & {
  __mnzDate: string;
};

// The kind declares no init params, so `init` ignores them and returns the
// fixture defaults.
const dataModel = new DataModelBuilder({ kind }).from<BlockData>("v1").init(() => ({
  // a fake product key so our mnz client response with a fake response without changing prod db.
  productKey: "PRODUCT:XTOKAYPLQDZWSPPUTFNHPAJQQZKKSPTCDOORHFJIOYICTRDA",
  inputHandles: [],
  shouldAddRunPerFile: false,
  __mnzDate: new Date().toISOString(), // It's OK
  __mnzCanRun: false,
}));

export const platforma = BlockModelV3.create({ dataModel, kind })

  // `__mnzCanRun` gates the run (it replaces V1's `.argsValid`) but is not itself
  // a workflow input, so it is read here and dropped. `__mnzDate` is dropped too:
  // the main template never reads it, and leaving it in args would stale the
  // block every minute when the monetization plugin re-stamps it.
  .args<BlockArgs>((data) => {
    if (!data.__mnzCanRun) throw new Error("Monetization does not allow this block to run");
    return {
      productKey: data.productKey,
      inputHandles: data.inputHandles,
      shouldAddRunPerFile: data.shouldAddRunPerFile,
    };
  })

  // Nothing to project: the kind takes no params. `inputHandles` are signed,
  // session-local references; `productKey` and `shouldAddRunPerFile` are fixture knobs
  // flipped in the UI; and the `__mnz*` fields belong to the monetization plugin.
  .templateParams(() => ({}))

  // Declaring this is mandatory, not an optimization. The pre-run is what
  // produces `__mnzInfo`, which is what flips `__mnzCanRun` to true — so it has
  // to keep running while `.args` is still throwing. Without an explicit
  // `prerunArgs`, the runtime falls back to the args lambda and the block
  // deadlocks: no pre-run, no info, no `canRun`, forever.
  .prerunArgs(
    (data): BlockPrerunArgs => ({
      productKey: data.productKey,
      inputHandles: data.inputHandles,
      shouldAddRunPerFile: data.shouldAddRunPerFile,
      __mnzDate: data.__mnzDate,
    }),
  )

  .output("__mnzInfo", (ctx) => ctx.prerun?.resolve("info")?.getDataAsJson<unknown>())

  .output("tokens", (ctx) =>
    ctx.outputs
      ?.resolve("token")
      ?.listInputFields()
      .map((field) => {
        return {
          name: field,
          value: ctx.outputs?.resolve("token", field)?.getDataAsString(),
        };
      }),
  )

  .output("progresses", (ctx) => {
    const m = ctx.prerun?.resolve("progresses");
    const progresses = m?.mapFields((name, val) => [name, val?.getImportProgress()]);
    return Object.fromEntries(progresses ?? []) as Record<string, unknown>;
  })

  .output("mainProgresses", (ctx) => {
    const m = ctx.outputs?.resolve("progresses");
    const progresses = m?.mapFields((name, val) => [name, val?.getImportProgress()]);
    return Object.fromEntries(progresses ?? []) as Record<string, unknown>;
  })

  .sections((_ctx) => [{ type: "link", href: "/", label: "Main" }])

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
