import type { InferHrefType, InferOutputsType } from "@platforma-sdk/model";
import { BlockModelV3, DataModelBuilder } from "@platforma-sdk/model";

// Data version 1: just numbers
type BlockDataV1 = {
  numbers: number[];
};

// Data version 2: added labels
type BlockDataV2 = {
  numbers: number[];
  labels: string[];
};

/**
 * Persistent block state for enter-numbers-v3. Version 3 of the schema.
 *
 * Spike probe — JSDoc on the alias and on each property must reach the
 * bundled facade `.d.ts` through `InferDataType<typeof platforma>`.
 */
export type BlockData = {
  /** Raw numbers entered by the user, in input order. */
  numbers: number[];
  /** Optional labels paired with each number. Empty until user provides one. */
  labels: string[];
  /** Human-friendly description of the dataset. */
  description: string;
};

/**
 * Sorted view of the numbers entered by the user. Returned by the `numbers`
 * output lambda so the inferred property of `BlockOutputs` carries this named
 * type and its JSDoc.
 *
 * Spike probe — named return type whose JSDoc must propagate downstream
 * through `InferOutputsType`.
 */
export type SortedNumbers = {
  /** Numbers in ascending order. */
  values: readonly number[];
  /** Count of unique values in `values`. */
  unique: number;
};

// Define data model with migrations from v1 to current
const dataModel = new DataModelBuilder()
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
  .init(() => ({ numbers: [], labels: [], description: "" }));

export const platforma = BlockModelV3.create(dataModel)

  .args((data) => {
    if (data.numbers.length === 0) {
      throw new Error("Numbers are required!");
    }
    return { numbers: data.numbers.toSorted() };
  })

  .prerunArgs((data) => {
    return { evenNumbers: data.numbers.toSorted().filter((n) => n % 2 === 0) };
  })

  .output("numbers", (ctx): SortedNumbers | undefined => {
    const raw = ctx.outputs?.resolve("numbers")?.getDataAsJson<number[]>();
    if (raw === undefined) return undefined;
    const values = [...raw].sort((a, b) => a - b);
    return { values, unique: new Set(values).size };
  })

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

/**
 * Reference shape exposed by this block — nominal record pinning the entered
 * numbers to the block identity.
 *
 * Spike probe — JSDoc on a hand-written helper type re-exported through the
 * facade. Both alias-level JSDoc and per-property JSDoc must survive.
 */
export type EnterNumbersRef = {
  /** Nominal tag pinning this ref to the enter-numbers-v3 block. */
  readonly kind: "enter-numbers-v3";
  /** Sorted numbers from the most recent run. */
  numbers: readonly number[];
};
