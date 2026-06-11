import type {
  JsonDataInfo,
  PColumnSpec,
  PObjectId,
  SpecQuery,
} from "@milaboratories/pl-model-common";
import type { PFrameInternal } from "@milaboratories/pl-model-middle-layer";
import { test } from "vitest";
import { embedInlineColumnTypeSpecs } from "./ptable_shared";

const COLUMN_SPEC: PColumnSpec = {
  kind: "PColumn",
  name: "inline1",
  valueType: "Int",
  axesSpec: [
    { name: "a1", type: "String" },
    { name: "a2", type: "Long" },
  ],
};

function inlineColumnNode(): SpecQuery {
  return {
    type: "inlineColumn",
    spec: { columnId: "col1" as PObjectId, spec: COLUMN_SPEC },
    dataInfo: { type: "Json", keyLength: 2, data: { '["a",1]': 10 } },
  };
}

/** Narrow to an inline column node and expose the (injected) typeSpec. */
function inlineDataInfo(query: SpecQuery): JsonDataInfo & {
  typeSpec?: PFrameInternal.PColumnValueTypeSpec;
} {
  if (query.type !== "inlineColumn") throw new Error(`expected inlineColumn, got ${query.type}`);
  return query.dataInfo;
}

test("embedInlineColumnTypeSpecs injects typeSpec derived from the column spec", ({ expect }) => {
  const result = embedInlineColumnTypeSpecs(inlineColumnNode());
  const dataInfo = inlineDataInfo(result);

  // typeSpec is the self-contained { axes, column } shape, derived from the
  // inline column's PColumnSpec (axis types in order + the value type).
  expect(dataInfo.typeSpec).toEqual({
    axes: ["String", "Long"],
    column: "Int",
  });
});

test("embedInlineColumnTypeSpecs preserves existing dataInfo fields", ({ expect }) => {
  const result = embedInlineColumnTypeSpecs(inlineColumnNode());
  const dataInfo = inlineDataInfo(result);

  expect(dataInfo.type).toBe("Json");
  expect(dataInfo.keyLength).toBe(2);
  expect(dataInfo.data).toEqual({ '["a",1]': 10 });
});

test("embedInlineColumnTypeSpecs leaves the inline column spec untouched", ({ expect }) => {
  const result = embedInlineColumnTypeSpecs(inlineColumnNode());
  if (result.type !== "inlineColumn") throw new Error("expected inlineColumn");
  expect(result.spec).toEqual({ columnId: "col1" as PObjectId, spec: COLUMN_SPEC });
});

test("embedInlineColumnTypeSpecs traverses into nested join entries", ({ expect }) => {
  const query: SpecQuery = {
    type: "fullJoin",
    entries: [{ entry: inlineColumnNode(), qualifications: [] }],
  };

  const result = embedInlineColumnTypeSpecs(query);
  if (result.type !== "fullJoin") throw new Error("expected fullJoin");
  const dataInfo = inlineDataInfo(result.entries[0].entry);

  expect(dataInfo.typeSpec).toEqual({ axes: ["String", "Long"], column: "Int" });
});

test("embedInlineColumnTypeSpecs traverses outerJoin primary and secondary entries", ({
  expect,
}) => {
  const query: SpecQuery = {
    type: "outerJoin",
    primary: { entry: inlineColumnNode(), qualifications: [] },
    secondary: [{ entry: inlineColumnNode(), qualifications: [] }],
  };

  const result = embedInlineColumnTypeSpecs(query);
  if (result.type !== "outerJoin") throw new Error("expected outerJoin");

  // Both traversal paths (primary via traverseEntry, secondary via map) must
  // reach the inline column and embed its typeSpec.
  expect(inlineDataInfo(result.primary.entry).typeSpec).toEqual({
    axes: ["String", "Long"],
    column: "Int",
  });
  expect(inlineDataInfo(result.secondary[0].entry).typeSpec).toEqual({
    axes: ["String", "Long"],
    column: "Int",
  });
});

test("embedInlineColumnTypeSpecs leaves non-inline nodes unchanged", ({ expect }) => {
  const query: SpecQuery = { type: "column", column: "col1" as PObjectId };
  const result = embedInlineColumnTypeSpecs(query);
  expect(result).toEqual(query);
});
