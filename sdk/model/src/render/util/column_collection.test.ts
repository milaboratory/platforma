import type {
  PColumn,
  PColumnSpec,
  PColumnValues,
  PObjectId,
} from "@milaboratories/pl-model-common";
import { expect, test } from "vitest";
import type { PColumnDataUniversal } from "../internal";
import { PColumnCollection, type ColumnProvider } from "./column_collection";

test("a column offered by two providers under one id is taken once, from the first provider", () => {
  const fromBlock = column("pool-sequence", "sequence", [{ key: ["f1"], val: "block" }]);
  const fromPool = column("pool-sequence", "sequence", [{ key: ["f1"], val: "pool" }]);

  const columns = new PColumnCollection()
    .addColumnProvider(provider([fromPool]))
    .addColumns([column("own-result", "result"), fromBlock])
    .getColumns(() => true);

  expect(columns?.map((c) => c.id)).toEqual(["own-result", "pool-sequence"]);
  expect(columns?.[1].data).toBe(fromBlock.data);
});

test("a column offered by two providers under different ids is taken once, from the first provider", () => {
  const columns = new PColumnCollection()
    .addColumnProvider(provider([column("pool-sequence", "sequence")]))
    .addColumns([column("block-sequence", "sequence")])
    .getColumns(() => true);

  expect(columns?.map((c) => c.id)).toEqual(["block-sequence"]);
});

test("one provider offering two columns under one id is an error", () => {
  const collection = new PColumnCollection().addColumnProvider(
    provider([column("pool-sequence", "sequence"), column("pool-sequence", "sequence")]),
  );

  expect(() => collection.getColumns(() => true)).toThrow(/Duplicate column id pool-sequence/);
});

test("two providers offering different columns under one id is an error", () => {
  const collection = new PColumnCollection()
    .addColumnProvider(provider([column("shared-id", "sequence")]))
    .addColumns([column("shared-id", "result")]);

  expect(() => collection.getColumns(() => true)).toThrow(
    /Column id shared-id .* is already taken by a different column/,
  );
});

// Internals

type Column = PColumn<PColumnDataUniversal | undefined>;

function column(id: string, name: string, data: PColumnValues = []): Column {
  const spec: PColumnSpec = {
    kind: "PColumn",
    name,
    valueType: "String",
    axesSpec: [{ name: "feature", type: "String" }],
  };
  return { id: id as PObjectId, spec, data };
}

function provider(columns: Column[]): ColumnProvider {
  return {
    selectColumns: (selectors) => {
      if (typeof selectors !== "function") throw new Error("Only predicates are used here");
      return columns.filter((c) => selectors(c.spec));
    },
  };
}
