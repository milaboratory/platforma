import {
  createGlobalPObjectId,
  type BlockDependenciesOutput,
  type BlockDependentsOutput,
  type ColumnValue,
  type DependencyEntry,
  type DependencyStatus,
  type DependentEntry,
  type DependentStatus,
} from "@platforma-sdk/model";
import { describe, expect, test } from "vitest";
import { blockName, linkAlerts, linkSections, type LinkSection } from "./utils";

const REF = createGlobalPObjectId("producer", "out");

describe("linkSections", () => {
  test("omits the used-by section when the runtime cannot list dependents", () => {
    const sections = linkSections({
      dependents: { type: "unsupported" },
      dependencies: dependencies([]),
    });
    expect(sections.map((section) => section.side)).toEqual(["uses"]);
  });

  test("omits sections whose output is not available", () => {
    expect(linkSections({ dependents: undefined, dependencies: undefined })).toEqual([]);
  });

  test("keeps empty sections when outputs are available", () => {
    const sections = linkSections({
      dependents: dependents([]),
      dependencies: dependencies([]),
    });
    expect(sections.map((section) => [section.side, section.rows])).toEqual([
      ["usedBy", []],
      ["uses", []],
    ]);
  });

  test("merges picks of one block from one output, keeping a whole-column use apart", () => {
    const [usedBy] = linkSections({
      dependents: dependents([
        dependent("b1", "out", [1, "a"]),
        dependent("b1", "out", ["1", "b"]),
        dependent("b1", "out", null),
        dependent("b2", "out", ["a"]),
      ]),
      dependencies: undefined,
    });
    expect(usedBy.rows.map((row) => [row.blockName, row.values])).toEqual([
      ["Enrichment", ["1", "a", "b"]],
      ["Enrichment", null],
      ["Block b2", ["a"]],
    ]);
  });

  test("keeps the column label, and the output name apart from it", () => {
    const [uses] = linkSections({
      dependents: undefined,
      dependencies: dependencies([
        dependency("p1", "out1", null, { type: "broken", reason: "unavailable" }),
        dependency("p1", "out2", null, { type: "ok" }, "Condition"),
      ]),
    });
    expect(uses.rows.map((row) => [row.output, row.columnLabel])).toEqual([
      ["out1", null],
      ["out2", "Condition"],
    ]);
  });

  test("takes a label from any merged reference", () => {
    const [uses] = linkSections({
      dependents: undefined,
      dependencies: dependencies([
        dependency("p1", "out", ["a"], { type: "pending" }),
        dependency("p1", "out", ["b"], { type: "ok" }, "Condition"),
      ]),
    });
    expect(uses.rows[0].columnLabel).toBe("Condition");
  });

  test("merged references take the status needing attention most, uniting missing values", () => {
    const [uses] = linkSections({
      dependents: undefined,
      dependencies: dependencies([
        dependency("p1", "out", ["a"], { type: "ok" }),
        dependency("p1", "out", ["b"], { type: "unchecked", reason: "unreadable" }),
        dependency("p1", "out", ["c"], { type: "pending" }),
        dependency("p2", "out", ["a"], missingValues([1])),
        dependency("p2", "out", ["b"], missingValues(["1", "b"])),
        dependency("p2", "out", ["c"], { type: "ok" }),
        dependency("p3", "out", ["a"], missingValues(["a"])),
        dependency("p3", "out", ["b"], { type: "broken", reason: "unavailable" }),
      ]),
    });
    expect(uses.rows.map((row) => row.status)).toEqual([
      { type: "pending" },
      { type: "missingValues", values: ["1", "b"] },
      { type: "unavailable" },
    ]);
  });

  test("missing values of a dependent block are listed as strings", () => {
    const [usedBy] = linkSections({
      dependents: dependents([
        dependent("b1", "out", ["a"], { type: "missingValues", values: [2] }),
      ]),
      dependencies: undefined,
    });
    expect(usedBy.rows[0].status).toEqual({ type: "missingValues", values: ["2"] });
  });

  test("an output another block uses and this block does not export is not exported", () => {
    const [usedBy] = linkSections({
      dependents: dependents([dependent("b1", "out", ["a"], notExported())]),
      dependencies: undefined,
    });
    expect(usedBy.rows.map((row) => row.status)).toEqual([{ type: "notExported" }]);
  });

  test("keeps the reason a link was not checked on both sides", () => {
    const [usedBy, uses] = linkSections({
      dependents: dependents([
        dependent("b1", "out", ["a"], { type: "unchecked", reason: "unreadable" }),
        dependent("b1", "other", ["a"], { type: "unchecked", reason: "unsupported" }),
      ]),
      dependencies: dependencies([
        dependency("p1", "out", ["a"], { type: "unchecked", reason: "unreadable" }),
        dependency("p1", "other", ["a"], { type: "unchecked", reason: "unsupported" }),
      ]),
    });
    const unchecked = [
      { type: "unchecked", reason: "unreadable" },
      { type: "unchecked", reason: "unsupported" },
    ];
    expect(usedBy.rows.map((row) => row.status)).toEqual(unchecked);
    expect(uses.rows.map((row) => row.status)).toEqual(unchecked);
  });
});

describe("linkAlerts", () => {
  test("lists only links that are broken or lack values, one alert per side", () => {
    const sections = linkSections({
      dependents: dependents([
        dependent("b1", "out", ["x", "y"], { type: "missingValues", values: ["x", "y"] }),
        dependent("b1", "other", ["x"], notExported()),
        dependent("b1", "third", ["x"], { type: "unchecked", reason: "unreadable" }),
      ]),
      dependencies: dependencies([
        dependency("p1", "out1", null, { type: "broken", reason: "unavailable" }),
        dependency("p1", "out2", ["a"], missingValues(["a"]), "Condition"),
        dependency("p1", "out3", ["a"], { type: "pending" }),
        dependency("p1", "out4", null, { type: "ok" }),
      ]),
    });
    expect(
      linkAlerts(sections).map((alert) => [
        alert.side,
        alert.label,
        alert.hint,
        alert.issues.map((issue) => `${issue.blockName} ${issue.text}`),
      ]),
    ).toEqual([
      [
        "usedBy",
        "Some blocks are missing data from this block",
        "Add the missing data to this block, or reconfigure those blocks.",
        [
          'Enrichment uses "x", "y", which this block\'s data no longer has',
          "Enrichment uses data this block does not export",
        ],
      ],
      [
        "uses",
        "Links to blocks this block takes data from are broken",
        null,
        ["Samples does not provide data this block uses", 'Samples has no "a" in "Condition"'],
      ],
    ]);
  });

  test("names a column by its quoted label", () => {
    const alerts = linkAlerts(
      linkSections({
        dependents: dependents([
          dependent("b1", "out", ["x"], notExported(), "Clonotypes"),
          dependent("b1", "other", ["x"], { type: "missingValues", values: ["x"] }, "Samples"),
        ]),
        dependencies: dependencies([
          dependency("p1", "out", null, { type: "broken", reason: "unavailable" }, "Condition"),
          dependency("p1", "other", ["a"], missingValues(["a"]), "Condition"),
        ]),
      }),
    );
    expect(alerts.map((alert) => alert.issues.map((issue) => issue.text))).toEqual([
      [
        'uses "Clonotypes", which this block does not export',
        'uses "x" of "Samples", which this block no longer has',
      ],
      ['does not provide "Condition"', 'has no "a" in "Condition"'],
    ]);
  });

  test("never names an output by its name, which is kept for a hint", () => {
    const [usedBy, uses] = linkAlerts(
      linkSections({
        dependents: dependents([
          dependent("b1", "pf.dataset.X", null, notExported()),
          dependent("b1", "pf.metadata.Y", ["a"], { type: "missingValues", values: ["a"] }),
        ]),
        dependencies: dependencies([
          dependency("p1", "pf.dataset.X", null, { type: "broken", reason: "unavailable" }),
          dependency("p1", "pf.metadata.Y", ["a"], missingValues(["a"])),
        ]),
      }),
    );
    const issues = [...usedBy.issues, ...uses.issues];
    for (const issue of issues) expect(issue.text).not.toMatch(/pf\./);
    expect(issues.map((issue) => issue.outputs)).toEqual([
      ["pf.dataset.X"],
      ["pf.metadata.Y"],
      ["pf.dataset.X"],
      ["pf.metadata.Y"],
    ]);
  });

  test("outputs of one block that are not exported and have no label share a line", () => {
    const [usedBy, uses] = linkAlerts(
      linkSections({
        dependents: dependents([
          dependent("b1", "out1", ["a"], notExported()),
          dependent("b1", "out1", null, notExported()),
          dependent("b2", "out1", null, notExported()),
          dependent("b1", "out2", null, notExported()),
          dependent("b1", "out3", null, notExported(), "Clonotypes"),
        ]),
        dependencies: dependencies([
          dependency("p1", "out1", null, { type: "broken", reason: "unavailable" }),
          dependency("p1", "out2", ["a"], { type: "broken", reason: "unavailable" }),
        ]),
      }),
    );
    expect(usedBy.issues.map((issue) => [issue.blockName, issue.text, issue.outputs])).toEqual([
      ["Enrichment", "uses 2 outputs this block does not export", ["out1", "out2"]],
      ["Block b2", "uses data this block does not export", ["out1"]],
      ["Enrichment", 'uses "Clonotypes", which this block does not export', ["out3"]],
    ]);
    expect(uses.issues.map((issue) => [issue.blockName, issue.text, issue.outputs])).toEqual([
      ["Samples", "does not provide 2 outputs this block uses", ["out1", "out2"]],
    ]);
  });

  test("issues name the other block by id, for opening it", () => {
    const [usedBy] = linkAlerts(
      linkSections({
        dependents: dependents([dependent("b1", "out", ["a"], notExported())]),
        dependencies: undefined,
      }),
    );
    expect(usedBy.issues.map((issue) => [issue.blockId, issue.blockName])).toEqual([
      ["b1", "Enrichment"],
    ]);
  });

  test("a side with no links needing attention has no alert", () => {
    const alerts = linkAlerts(
      linkSections({
        dependents: dependents([dependent("b1", "out", ["a"], { type: "pending" })]),
        dependencies: dependencies([dependency("p1", "out", null, { type: "ok" })]),
      }),
    );
    expect(alerts).toEqual([]);
  });

  test("broken links this block uses are an error", () => {
    const [uses] = linkAlerts(
      linkSections({
        dependents: undefined,
        dependencies: dependencies([dependency("p1", "out", ["a"], missingValues(["a"]))]),
      }),
    );
    expect([uses.side, uses.type]).toEqual(["uses", "error"]);
  });

  test("blocks using an output this block does not export are a warning", () => {
    const [usedBy] = linkAlerts(
      linkSections({
        dependents: dependents([
          dependent("b1", "out", ["a"], { type: "missingValues", values: ["a"] }),
          dependent("b2", "out", ["a"], notExported()),
        ]),
        dependencies: undefined,
      }),
    );
    expect([usedBy.side, usedBy.type]).toEqual(["usedBy", "warn"]);
  });

  test("blocks picking values this block's output lacks are a warning", () => {
    const [usedBy] = linkAlerts(
      linkSections({
        dependents: dependents([
          dependent("b1", "out", ["a"], { type: "missingValues", values: ["a"] }),
        ]),
        dependencies: undefined,
      }),
    );
    expect([usedBy.side, usedBy.type]).toEqual(["usedBy", "warn"]);
  });

  test("keys are unique across sides", () => {
    const sections: LinkSection[] = linkSections({
      dependents: dependents([
        dependent("p1", "out", ["a"], { type: "missingValues", values: ["a"] }),
      ]),
      dependencies: dependencies([dependency("p1", "out", ["a"], missingValues(["a"]))]),
    });
    const keys = linkAlerts(sections).flatMap((alert) => alert.issues.map((issue) => issue.key));
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("blockName", () => {
  test("falls back to a short id", () => {
    expect(blockName({ b1: "Enrichment" }, "b1")).toBe("Enrichment");
    expect(blockName({}, "0123456789abcdef")).toBe("Block 01234567");
  });
});

// Internals

function dependents(items: DependentEntry[]): BlockDependentsOutput {
  return { type: "ok", items, labels: { b1: "Enrichment" } };
}

function dependencies(
  items: DependencyEntry[],
  argsSource: BlockDependenciesOutput["argsSource"] = "current",
): BlockDependenciesOutput {
  return { argsSource, items, labels: { p1: "Samples" } };
}

function dependent(
  dependentBlockId: string,
  output: string,
  values: null | ColumnValue[],
  status: DependentStatus = { type: "ok" },
  columnLabel: null | string = null,
): DependentEntry {
  return { dependentBlockId, output, ref: REF, values, columnLabel, status };
}

function dependency(
  producerBlockId: string,
  output: string,
  values: null | ColumnValue[],
  status: DependencyStatus,
  columnLabel: null | string = null,
): DependencyEntry {
  return { producerBlockId, output, ref: REF, values, columnLabel, status };
}

function missingValues(values: ColumnValue[]): DependencyStatus {
  return { type: "broken", reason: "missingValues", values };
}

function notExported(): DependentStatus {
  return { type: "broken", reason: "notExported" };
}
