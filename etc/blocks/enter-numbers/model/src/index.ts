import type { InferHrefType, InferOutputsType } from "@platforma-sdk/model";
import { BlockModelV3, DataModelBuilder } from "@platforma-sdk/model";
import { kind } from "@milaboratories/milaboratories.test-enter-numbers.kind";
import * as v from "valibot";

// Data version 1: just numbers
type BlockDataV1 = {
  numbers: number[];
};

// Data version 2: added labels
type BlockDataV2 = {
  numbers: number[];
  labels: string[];
};

// Data version 3 (current): added description
export const $BlockData = v.object({
  numbers: v.array(v.pipe(v.unknown(), v.transform(Number), v.number())),
  labels: v.array(v.string()),
  description: v.string(),
});

export type BlockData = v.InferOutput<typeof $BlockData>;

// Define data model with migrations from v1 to current
const dataModel = new DataModelBuilder({ kind })
  .from<BlockDataV1>("v1")
  // Migration v1 → v2: sort numbers and add labels
  // Throws if numbers contain 666 (for testing migration failure recovery)
  .migrate<BlockDataV2>("v2", (data) => {
    if (data.numbers.includes(666)) {
      throw new Error("Migration failed: number 666 is forbidden!");
    }
    return { numbers: data.numbers.toSorted(), labels: ["migrated-from-v1"] };
  })
  // Migration v2 → v3: add description
  .migrate<BlockData>("v3", (data) => {
    return { ...data, description: `Migrated: ${data.labels.join(", ")}` };
  })
  // `numbers` is the kind's only init param; `labels` / `description` are
  // populated by the migrations above and always start empty. `params` is
  // optional — a block may be created without a template — so it keeps a
  // fallback default.
  .init(({ params }) => ({ numbers: params?.numbers ?? [], labels: [], description: "" }));

export const platforma = BlockModelV3.create({ dataModel, kind })

  .args((data) => {
    if (data.numbers.length === 0) {
      throw new Error("Numbers are required!");
    }
    // Test sentinel: args() returns undefined (without throwing) to exercise the
    // "derivation succeeds but value is undefined" contract used by real blocks
    // (e.g. `if (!Valid.safeParse(data).success) return undefined`).
    if (data.numbers.length === 1 && data.numbers[0] === 777) {
      return undefined;
    }
    return { numbers: data.numbers.toSorted() };
  })

  .prerunArgs((data) => {
    return { evenNumbers: data.numbers.toSorted().filter((n) => n % 2 === 0) };
  })

  .templateParams((data) => {
    return { numbers: data.numbers };
  })

  .output("numbers", (ctx) => ctx.outputs?.resolve("numbers")?.getDataAsJson<number[]>())

  .output("activeArgs", (ctx) => ctx.activeArgs)

  .output(
    "numbersCount",
    (ctx) => ctx.prerun?.resolve("numbersCount")?.getDataAsJson<number>() ?? 0,
  )

  .output("prerunArgsJson", (ctx) =>
    ctx.prerun?.resolve("prerunArgsJson")?.getDataAsJson<Record<string, unknown>>(),
  )

  .output("errorIfNumberIs999", (ctx) => {
    const numbers = ctx.args?.numbers;

    if (numbers?.length === 1 && numbers[0] === 999) {
      return ctx.prerun?.resolve("numbers")?.getFileContentAsJson<number[]>();
    }

    return numbers ?? [];
  })

  .output("ctx", (ctx) => ctx)

  .output("ctx.activeArgs", (ctx) => ctx.activeArgs)

  .output("ctx.args", (ctx) => ctx.args)

  .output("ctx.data", (ctx) => ctx.data)

  .sections((_ctx) => {
    return [{ type: "link", href: "/", label: "Main" }];
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
export type Href = InferHrefType<typeof platforma>;
