import {
  canonicalizeJson,
  collectColumnReferences,
  createColumnFilteredId,
  createColumnValueId,
  createGlobalPObjectId,
  createLocalPObjectId,
  createPlRef,
  relocateBlockIds,
  type ColumnUniversalId,
} from "@milaboratories/pl-model-common";
import { describe, expect, test } from "vitest";
import { buildOutputDependencyIndex, type ArgsField } from "./output_dependencies";
import type { ProjectStructure } from "./project_model";

const condition: ColumnUniversalId = createGlobalPObjectId("samples", "metadata.condition");
const donor: ColumnUniversalId = createGlobalPObjectId("samples", "metadata.donor");

const conditionValue = (value: string | number) =>
  createColumnValueId({ column: condition, value });

function structure(...ids: string[]): ProjectStructure {
  return {
    groups: [
      {
        id: "g1",
        label: "G1",
        blocks: ids.map((id) => ({ id, label: id, renderingMode: "Heavy" })),
      },
    ],
  };
}

type BlockArgs = Partial<Record<ArgsField, unknown>>;

function index(struct: ProjectStructure, args: Record<string, BlockArgs>) {
  const asked: string[] = [];
  const result = buildOutputDependencyIndex(struct, {
    argsOf: (blockId, field) => {
      asked.push(`${blockId}:${field}`);
      return args[blockId]?.[field];
    },
    referencesOf: collectColumnReferences,
  });
  return { result, asked };
}

describe("buildOutputDependencyIndex", () => {
  test("a ref object is a dependency on the whole output", () => {
    const { result } = index(structure("samples", "clustering"), {
      samples: { currentArgs: {} },
      clustering: { currentArgs: { input: createPlRef("samples", "metadata.donor", true) } },
    });

    expect(result.get("samples")).toEqual([
      { dependentBlockId: "clustering", output: "metadata.donor", ref: donor, values: null },
    ]);
    expect(result.has("clustering")).toBe(false);
  });

  test("a column id string is a dependency on the whole output", () => {
    const { result } = index(structure("samples", "clustering"), {
      samples: { currentArgs: {} },
      clustering: { currentArgs: { column: condition } },
    });

    expect(result.get("samples")).toEqual([
      {
        dependentBlockId: "clustering",
        output: "metadata.condition",
        ref: condition,
        values: null,
      },
    ]);
  });

  test("a filtered id is one dependency held as filtered, not a second one on its leaf", () => {
    const filtered = createColumnFilteredId({ source: condition, axisFilters: [[0, "s1"]] });
    const { result } = index(structure("samples", "clustering"), {
      samples: { currentArgs: {} },
      clustering: { currentArgs: { column: filtered } },
    });

    expect(result.get("samples")).toEqual([
      { dependentBlockId: "clustering", output: "metadata.condition", ref: filtered, values: null },
    ]);
  });

  test("picked values merge into the dependency on their column, in args order", () => {
    const { result } = index(structure("samples", "enrichment"), {
      samples: { currentArgs: {} },
      enrichment: {
        currentArgs: {
          column: condition,
          order: [conditionValue("ctrl"), conditionValue(2), conditionValue("ctrl")],
        },
      },
    });

    expect(result.get("samples")).toEqual([
      {
        dependentBlockId: "enrichment",
        output: "metadata.condition",
        ref: condition,
        values: ["ctrl", 2],
      },
    ]);
  });

  test("a picked value whose column is not referenced on its own still makes a dependency", () => {
    const { result } = index(structure("samples", "enrichment"), {
      samples: { currentArgs: {} },
      enrichment: { currentArgs: { target: conditionValue("ctrl") } },
    });

    expect(result.get("samples")).toEqual([
      {
        dependentBlockId: "enrichment",
        output: "metadata.condition",
        ref: condition,
        values: ["ctrl"],
      },
    ]);
  });

  test("a value picked through a filtered column belongs to the filtered reference", () => {
    const filtered = createColumnFilteredId({ source: condition, axisFilters: [[0, "s1"]] });
    const { result } = index(structure("samples", "enrichment"), {
      samples: { currentArgs: {} },
      enrichment: {
        currentArgs: {
          column: condition,
          target: createColumnValueId({ column: filtered, value: "ctrl" }),
        },
      },
    });

    expect(result.get("samples")).toEqual([
      expect.objectContaining({ ref: condition, values: null }),
      expect.objectContaining({ ref: filtered, values: ["ctrl"] }),
    ]);
  });

  test("a producer below the dependent block is not indexed", () => {
    const { result } = index(structure("enrichment", "samples"), {
      samples: { currentArgs: {} },
      enrichment: { currentArgs: { target: conditionValue("ctrl"), column: donor } },
    });

    expect(result.size).toBe(0);
  });

  test("a removed producer has no dependencies", () => {
    const { result } = index(structure("enrichment"), {
      enrichment: { currentArgs: { target: conditionValue("ctrl") } },
    });

    expect(result.size).toBe(0);
  });

  test("a block's reference to its own output is not indexed", () => {
    const { result } = index(structure("samples"), {
      samples: { currentArgs: { self: condition } },
    });

    expect(result.size).toBe(0);
  });

  test("a block without current args is read from the args of its last run", () => {
    const { result, asked } = index(structure("samples", "enrichment", "other"), {
      samples: { currentArgs: {} },
      enrichment: { prodArgs: { target: conditionValue("ctrl") } },
      other: {
        currentArgs: { target: conditionValue("treated") },
        prodArgs: { target: conditionValue("old") },
      },
    });

    expect(result.get("samples")).toEqual([
      expect.objectContaining({ dependentBlockId: "enrichment", values: ["ctrl"] }),
      expect.objectContaining({ dependentBlockId: "other", values: ["treated"] }),
    ]);
    // Last-run args are not read for a block that has current args.
    expect(asked).not.toContain("other:prodArgs");
  });

  test("a block whose args have errors is read from them, not from its last run", () => {
    const { result, asked } = index(structure("samples", "enrichment"), {
      samples: { currentArgs: {} },
      enrichment: {
        currentDraftArgs: { column: condition, target: undefined },
        prodArgs: { column: donor },
      },
    });

    expect(result.get("samples")).toEqual([
      expect.objectContaining({ dependentBlockId: "enrichment", ref: condition, values: null }),
    ]);
    expect(asked).not.toContain("enrichment:prodArgs");
  });

  test("a reference only the prerun args hold is indexed", () => {
    const { result } = index(structure("samples", "enrichment"), {
      samples: { currentArgs: {} },
      enrichment: { currentArgs: {}, currentPrerunArgs: { preview: donor } },
    });

    expect(result.get("samples")).toEqual([
      { dependentBlockId: "enrichment", output: "metadata.donor", ref: donor, values: null },
    ]);
  });

  test("references of the args come first, then those only the prerun args hold", () => {
    const { result } = index(structure("samples", "enrichment"), {
      samples: { currentArgs: {} },
      enrichment: {
        currentArgs: { target: conditionValue("ctrl") },
        currentPrerunArgs: { preview: donor, target: conditionValue("ctrl") },
      },
    });

    expect(result.get("samples")).toEqual([
      expect.objectContaining({ ref: condition, values: ["ctrl"] }),
      expect.objectContaining({ ref: donor, values: null }),
    ]);
  });

  test("one column in both chains is one dependency with the values of both", () => {
    const { result } = index(structure("samples", "enrichment"), {
      samples: { currentArgs: {} },
      enrichment: {
        currentArgs: { target: conditionValue("ctrl") },
        currentPrerunArgs: { order: [conditionValue("treated"), conditionValue("ctrl")] },
      },
    });

    expect(result.get("samples")).toEqual([
      {
        dependentBlockId: "enrichment",
        output: "metadata.condition",
        ref: condition,
        values: ["ctrl", "treated"],
      },
    ]);
  });

  test("a column used whole in one chain takes the values the other picks", () => {
    const { result } = index(structure("samples", "enrichment"), {
      samples: { currentArgs: {} },
      enrichment: {
        currentArgs: { column: condition },
        currentPrerunArgs: { target: conditionValue("ctrl") },
      },
    });

    expect(result.get("samples")).toEqual([
      expect.objectContaining({ ref: condition, values: ["ctrl"] }),
    ]);
  });

  test("the prerun chain falls back to its draft, then to the args of the current staging", () => {
    const { result, asked } = index(structure("samples", "a", "b"), {
      samples: { currentArgs: {} },
      a: {
        currentDraftPrerunArgs: { preview: conditionValue("draft") },
        stagingArgs: { preview: conditionValue("staged") },
      },
      b: { stagingArgs: { preview: conditionValue("staged") } },
    });

    expect(result.get("samples")).toEqual([
      expect.objectContaining({ dependentBlockId: "a", values: ["draft"] }),
      expect.objectContaining({ dependentBlockId: "b", values: ["staged"] }),
    ]);
    expect(asked).not.toContain("a:stagingArgs");
  });

  test("args with errors are not mixed with the args the last prerun ran on", () => {
    // The prerun is skipped while the args have errors, so the staging still holds the args the
    // last prerun ran on, with a column the current args no longer reference.
    const { result, asked } = index(structure("samples", "enrichment"), {
      samples: { currentArgs: {} },
      enrichment: {
        currentDraftArgs: { column: condition, target: undefined },
        stagingArgs: { column: donor },
        prodArgs: { column: donor },
      },
    });

    expect(result.get("samples")).toEqual([
      expect.objectContaining({ dependentBlockId: "enrichment", ref: condition, values: null }),
    ]);
    expect(asked).not.toContain("enrichment:stagingArgs");
    expect(asked).not.toContain("enrichment:prodArgs");
  });

  test("current args are not mixed with the args of a staging the prerun no longer renders", () => {
    const { result, asked } = index(structure("samples", "enrichment"), {
      samples: { currentArgs: {} },
      enrichment: { currentArgs: { column: condition }, stagingArgs: { column: donor } },
    });

    expect(result.get("samples")).toEqual([
      expect.objectContaining({ dependentBlockId: "enrichment", ref: condition, values: null }),
    ]);
    expect(asked).not.toContain("enrichment:stagingArgs");
  });

  test("without args derived from the current data both last-run fields are read", () => {
    const { result } = index(structure("samples", "enrichment"), {
      samples: { currentArgs: {} },
      enrichment: {
        prodArgs: { target: conditionValue("ctrl") },
        stagingArgs: { preview: donor, target: conditionValue("treated") },
      },
    });

    expect(result.get("samples")).toEqual([
      expect.objectContaining({ ref: condition, values: ["ctrl", "treated"] }),
      expect.objectContaining({ ref: donor, values: null }),
    ]);
  });

  test("a block with no args at all contributes nothing", () => {
    const { result } = index(structure("samples", "enrichment"), {
      samples: { currentArgs: {} },
      enrichment: {},
    });

    expect(result.size).toBe(0);
  });

  test("a removed dependent block disappears from the index", () => {
    const args: Record<string, BlockArgs> = {
      samples: { currentArgs: {} },
      enrichment: { currentArgs: { target: conditionValue("ctrl") } },
    };

    expect(index(structure("samples", "enrichment"), args).result.has("samples")).toBe(true);
    expect(index(structure("samples"), args).result.has("samples")).toBe(false);
  });

  test("dependencies come in project order, then in the order the args hold them", () => {
    const { result } = index(structure("samples", "a", "b"), {
      samples: { currentArgs: {} },
      a: { currentArgs: { x: createColumnValueId({ column: donor, value: "d1" }), y: condition } },
      b: { currentArgs: { y: conditionValue("ctrl"), z: donor } },
    });

    expect(result.get("samples")).toEqual([
      { dependentBlockId: "a", output: "metadata.donor", ref: donor, values: ["d1"] },
      { dependentBlockId: "a", output: "metadata.condition", ref: condition, values: null },
      { dependentBlockId: "b", output: "metadata.condition", ref: condition, values: ["ctrl"] },
      { dependentBlockId: "b", output: "metadata.donor", ref: donor, values: null },
    ]);
  });

  test("ids used as object keys are found", () => {
    const { result } = index(structure("samples", "enrichment"), {
      samples: { currentArgs: {} },
      enrichment: {
        currentArgs: { ranks: { [conditionValue("ctrl")]: 1 }, labels: { [donor]: 1 } },
      },
    });

    expect(result.get("samples")).toEqual([
      expect.objectContaining({ ref: condition, values: ["ctrl"] }),
      expect.objectContaining({ ref: donor, values: null }),
    ]);
  });

  test("a column local to the dependent block is ignored", () => {
    const local: ColumnUniversalId = createLocalPObjectId(["outputs", "table"], "condition");
    const { result } = index(structure("samples", "enrichment"), {
      samples: { currentArgs: {} },
      enrichment: {
        currentArgs: { column: local, target: createColumnValueId({ column: local, value: "x" }) },
      },
    });

    expect(result.size).toBe(0);
  });

  test("a malformed id in one block does not hide the dependencies of another", () => {
    // The marker of a filtered column with no source to resolve to a leaf.
    const malformedColumn = '{"__isFiltered":true}';
    const malformedValue = canonicalizeJson({
      __isColumnValue: true,
      column: malformedColumn,
      value: "ctrl",
    });
    const { result } = index(structure("samples", "broken", "enrichment"), {
      samples: { currentArgs: {} },
      broken: { currentArgs: { column: malformedColumn, target: malformedValue, ok: donor } },
      enrichment: { currentArgs: { target: conditionValue("treated") } },
    });

    expect(result.get("samples")).toEqual([
      expect.objectContaining({ dependentBlockId: "broken", ref: donor, values: null }),
      expect.objectContaining({ dependentBlockId: "enrichment", values: ["treated"] }),
    ]);
  });

  test("duplicated blocks with identical args are each listed, in project order", () => {
    const args = { target: conditionValue("ctrl") };
    const { result } = index(structure("samples", "copy1", "copy2"), {
      samples: { currentArgs: {} },
      copy1: { currentArgs: args },
      copy2: { currentArgs: structuredClone(args) },
    });

    expect(result.get("samples")).toEqual([
      expect.objectContaining({ dependentBlockId: "copy1", values: ["ctrl"] }),
      expect.objectContaining({ dependentBlockId: "copy2", values: ["ctrl"] }),
    ]);
  });

  test("a block applied from a template depends on the block its entry became", () => {
    const tplArgs = {
      input: createPlRef("tpl-samples", "metadata.donor"),
      target: createColumnValueId({
        column: createGlobalPObjectId("tpl-samples", "metadata.condition"),
        value: "ctrl",
      }),
    };
    const args = relocateBlockIds(tplArgs, new Map([["tpl-samples", "samples"]]));
    const { result } = index(structure("samples", "enrichment"), {
      samples: { currentArgs: {} },
      enrichment: { currentArgs: args },
    });

    expect(result.get("samples")).toEqual([
      { dependentBlockId: "enrichment", output: "metadata.donor", ref: donor, values: null },
      {
        dependentBlockId: "enrichment",
        output: "metadata.condition",
        ref: condition,
        values: ["ctrl"],
      },
    ]);
    expect(result.has("tpl-samples")).toBe(false);
  });
});
