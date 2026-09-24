import { describe, expect, test } from "vitest";
import { createLocalPObjectId } from "../pool";
import { indexAccessorRoot } from "./accessor_traversal";
import { columnFieldErrors, hasErroredSpec } from "./column_field";
import { fakePFrame, fakeTree } from "./__test_helpers__/fake_tree";

describe("indexAccessorRoot", () => {
  test("an errored map field is reported with its path, and its sibling is walked", () => {
    const root = fakeTree({
      type: "StdMap",
      fields: {
        healthy: { value: fakePFrame({ col: {} }) },
        broken: { error: "step ran out of memory" },
      },
    });

    const { entries, errors } = indexAccessorRoot(root, ["main"]);

    expect(entries.map((e) => e.id)).toEqual([createLocalPObjectId(["main", "healthy"], "col")]);
    expect(errors).toEqual([
      { kind: "source", path: ["main", "broken"], message: "step ran out of memory" },
    ]);
  });

  test("a column whose fields carry errors is still listed", () => {
    const root = fakeTree(fakePFrame({ col: { data: { error: "OOM" } } }));

    const { entries, errors } = indexAccessorRoot(root, ["main"]);

    expect(entries).toHaveLength(1);
    expect(errors).toEqual([]);
  });
});

describe("column field errors", () => {
  test("an errored data field is reported, a healthy spec is not", () => {
    const [entry] = indexAccessorRoot(fakeTree(fakePFrame({ col: { data: { error: "OOM" } } })), [
      "main",
    ]).entries;

    expect(columnFieldErrors(entry)).toEqual([
      { kind: "column", id: entry.id, field: "data", message: "OOM" },
    ]);
    expect(hasErroredSpec(entry)).toBe(false);
  });

  test("an errored spec field with a value is reported", () => {
    const spec = { value: { type: "json", data: { kind: "PColumn" } }, error: "bad spec" };
    const [entry] = indexAccessorRoot(fakeTree(fakePFrame({ col: { spec } })), ["main"]).entries;

    expect(columnFieldErrors(entry)).toEqual([
      { kind: "column", id: entry.id, field: "spec", message: "bad spec" },
    ]);
    expect(hasErroredSpec(entry)).toBe(true);
  });
});
