import { Annotation, Pl, stringifyJson } from "@milaboratories/pl-middle-layer";
import { awaitStableState, tplTest } from "@platforma-sdk/test";
import { vi } from "vitest";
import dedent from "dedent";
import { Timeout, getFileContent } from "../pt/helpers";

vi.setConfig({ testTimeout: Timeout });

// Primary data: 3 rows, 1 axis (id) + 1 value column (score)
const primaryCsv = dedent`
  id,score
  A,10
  B,20
  C,30
`;

const primarySpec = {
  axes: [
    {
      column: "id",
      spec: {
        name: "pl7.app/id",
        type: "String",
        annotations: { [Annotation.Label]: "ID" } satisfies Annotation,
      },
    },
  ],
  columns: [
    {
      column: "score",
      id: "score",
      spec: {
        valueType: "Int",
        name: "pl7.app/score",
        annotations: { [Annotation.Label]: "Score" } satisfies Annotation,
      },
    },
  ],
  storageFormat: "Json",
  partitionKeyLength: 0,
};

// Filter: subset — only rows A and C
const filterCsv = dedent`
  id,isSubset
  A,true
  C,true
`;

const filterSpec = {
  axes: [
    {
      column: "id",
      spec: {
        name: "pl7.app/id",
        type: "String",
        annotations: { [Annotation.Label]: "ID" } satisfies Annotation,
      },
    },
  ],
  columns: [
    {
      column: "isSubset",
      id: "filter1",
      spec: {
        valueType: "String",
        name: "pl7.app/filter",
        annotations: {
          [Annotation.Label]: "Filter",
          [Annotation.IsSubset]: stringifyJson(true),
        } satisfies Annotation,
      },
    },
  ],
  storageFormat: "Json",
  partitionKeyLength: 0,
};

// Helper: invoke the reusable ephemeral runner (`pframes.table-builder.tpl.tengo`)
// with a declarative spec. Adding a new ephemeral test case is now a function
// call with different args — no new template required.
async function runEphemeralBuilder(
  helper: Parameters<Parameters<typeof tplTest>[1]>[0]["helper"],
  driverKit: Parameters<Parameters<typeof tplTest>[1]>[0]["driverKit"],
  spec: Record<string, unknown>,
): Promise<string> {
  const result = await helper.renderTemplate(false, "pframes.table-builder", ["result"], (tx) => {
    const args: Record<string, ReturnType<typeof tx.createValue>> = {};
    for (const [key, value] of Object.entries(spec)) {
      args[key] = tx.createValue(Pl.JsonObject, JSON.stringify(value));
    }
    return args;
  });
  return getFileContent(result, "result", driverKit);
}

tplTest.concurrent(
  "tableBuilder: build produces TSV with correct rows",
  async ({ helper, expect, driverKit }) => {
    const content = await runEphemeralBuilder(helper, driverKit, {
      format: "tsv",
      imports: { main: { csv: primaryCsv, spec: primarySpec } },
      primaries: [{ name: "main", sourceImport: "main" }],
    });
    const lines = content.trim().split("\n");

    // Exact header (axis label + value column label, derived from pl7.app/label).
    expect(lines[0]).toBe("ID\tScore");
    // Sorted by ID axis.
    expect(lines.slice(1)).toEqual(["A\t10", "B\t20", "C\t30"]);
  },
);

tplTest.concurrent(
  "tableBuilder: inner-join with filter reduces key space",
  async ({ helper, expect, driverKit }) => {
    const content = await runEphemeralBuilder(helper, driverKit, {
      format: "tsv",
      imports: {
        main: { csv: primaryCsv, spec: primarySpec },
        subset: { csv: filterCsv, spec: filterSpec },
      },
      primaries: [{ name: "main", sourceImport: "main", filterImport: "subset" }],
    });
    const lines = content.trim().split("\n");

    // Filter is a subset column — output drops rows missing from it (B filtered).
    expect(lines[0]).toBe("ID\tScore");
    expect(lines.slice(1)).toEqual(["A\t10", "C\t30"]);
  },
);

// Two-primary scenario: each primary brings its own keys; the output respects
// `setJoinMode`. Primary "x" has rows A,B; primary "y" has rows A,C.
//   inner → {A}      (intersection)
//   full  → {A,B,C}  (union; missing values render as empty cells)
const xCsv = dedent`
  id,xVal
  A,1
  B,2
`;
const yCsv = dedent`
  id,yVal
  A,10
  C,30
`;
function specWithLong(columnName: string, valueName: string, valueLabel: string) {
  return {
    axes: [
      {
        column: "id",
        spec: {
          name: "pl7.app/id",
          type: "String",
          annotations: { [Annotation.Label]: "ID" } satisfies Annotation,
        },
      },
    ],
    columns: [
      {
        column: columnName,
        id: columnName,
        spec: {
          valueType: "Long",
          name: valueName,
          annotations: { [Annotation.Label]: valueLabel } satisfies Annotation,
        },
      },
    ],
    storageFormat: "Json",
    partitionKeyLength: 0,
  };
}
const xSpec = specWithLong("xVal", "pl7.app/x", "X");
const ySpec = specWithLong("yVal", "pl7.app/y", "Y");

tplTest.concurrent(
  "tableBuilder: multi-primary inner join keeps only shared keys",
  async ({ helper, expect, driverKit }) => {
    const content = await runEphemeralBuilder(helper, driverKit, {
      format: "tsv",
      imports: {
        x: { csv: xCsv, spec: xSpec },
        y: { csv: yCsv, spec: ySpec },
      },
      primaries: [
        { name: "x", sourceImport: "x" },
        { name: "y", sourceImport: "y" },
      ],
      joinMode: "inner",
    });
    const lines = content.trim().split("\n");

    expect(lines[0]).toBe("ID\tX\tY");
    expect(lines.slice(1)).toEqual(["A\t1\t10"]);
  },
);

tplTest.concurrent(
  "tableBuilder: multi-primary full join keeps the union of keys",
  async ({ helper, expect, driverKit }) => {
    const content = await runEphemeralBuilder(helper, driverKit, {
      format: "tsv",
      imports: {
        x: { csv: xCsv, spec: xSpec },
        y: { csv: yCsv, spec: ySpec },
      },
      primaries: [
        { name: "x", sourceImport: "x" },
        { name: "y", sourceImport: "y" },
      ],
      joinMode: "full",
    });
    const lines = content.trim().split("\n");

    // Union: A (in both), B (only in x), C (only in y). Missing → empty cell.
    expect(lines[0]).toBe("ID\tX\tY");
    expect(lines.slice(1).sort()).toEqual(["A\t1\t10", "B\t2\t", "C\t\t30"]);
  },
);

// End-to-end exercise of `addColumns` with a `ColumnQuerySpec` (multi-match).
// Producer workflow exports four PColumns sharing a `pl7.app/id` axis:
//   - `primary`  → anchor (named "pl7.app/test/primary")
//   - `score`    → metric ("pl7.app/metric/score") — should match the query
//   - `count`    → metric ("pl7.app/metric/count") — should match the query
//   - `label`    → other ("pl7.app/other/label") — should NOT match
// Consumer renders against the producer's context: addPrimary via PlRef,
// addColumns with `namePattern: "pl7.app/metric/.*"`, headerPrefix "m_".
// Verification: the output TSV contains exactly the matched columns under
// the prefixed labels and excludes the non-matching one.
const multiMatchAxis = {
  name: "pl7.app/id",
  type: "String",
  annotations: { [Annotation.Label]: "ID" } satisfies Annotation,
};
const multiMatchCsv = dedent`
  id,primary,score,count,label
  A,1,10,100,foo
  B,2,20,200,bar
  C,3,30,300,baz
`;
const multiMatchSpec = {
  axes: [{ column: "id", spec: multiMatchAxis }],
  columns: [
    {
      column: "primary",
      id: "primary",
      spec: {
        valueType: "Long",
        name: "pl7.app/test/primary",
        annotations: { [Annotation.Label]: "Primary" } satisfies Annotation,
      },
    },
    {
      column: "score",
      id: "score",
      spec: {
        valueType: "Long",
        name: "pl7.app/metric/score",
        annotations: { [Annotation.Label]: "Score" } satisfies Annotation,
      },
    },
    {
      column: "count",
      id: "count",
      spec: {
        valueType: "Long",
        name: "pl7.app/metric/count",
        annotations: { [Annotation.Label]: "Count" } satisfies Annotation,
      },
    },
    {
      column: "label",
      id: "label",
      spec: {
        valueType: "String",
        name: "pl7.app/other/label",
        annotations: { [Annotation.Label]: "OtherLabel" } satisfies Annotation,
      },
    },
  ],
  storageFormat: "Json",
  partitionKeyLength: 0,
};

// Helper: render the producer workflow for query-spec tests, then render the
// consumer with the supplied tableBuilder spec. Returns the output TSV.
async function runQuerySpecConsumer(
  helper: Parameters<Parameters<typeof tplTest>[1]>[0]["helper"],
  driverKit: Parameters<Parameters<typeof tplTest>[1]>[0]["driverKit"],
  producerBlockId: string,
  consumerBlockId: string,
  consumerArgs: Record<string, unknown>,
): Promise<string> {
  const producer = await helper.renderWorkflow(
    "pframes.table-builder-multi-producer",
    false,
    { csv: multiMatchCsv, spec: multiMatchSpec },
    { blockId: producerBlockId },
  );
  const ctx = await awaitStableState(producer.context());

  const consumer = await helper.renderWorkflow(
    "pframes.table-builder-multi-consumer",
    false,
    { producerBlockId, primaryExportKey: "primary", format: "tsv", ...consumerArgs },
    { parent: ctx, blockId: consumerBlockId },
  );

  return getFileContent(consumer, "tableFile", driverKit);
}

tplTest.concurrent(
  "tableBuilder: addColumns with query spec expands to all matching columns",
  async ({ helper, expect, driverKit }) => {
    const content = await runQuerySpecConsumer(
      helper,
      driverKit,
      "producer-multi",
      "consumer-multi",
      {
        addColumns: [
          {
            query: {
              axes: [{ anchor: "main", name: "pl7.app/id" }],
              namePattern: "pl7.app/metric/.*",
            },
            opts: { headerPrefix: "m_" },
          },
        ],
      },
    );
    const header = content.trim().split("\n")[0];

    // Axis label + primary value column + two prefixed multi-match columns.
    expect(header).toContain("ID");
    expect(header).toContain("Primary");
    expect(header).toContain("m_Score");
    expect(header).toContain("m_Count");
    // Non-matching column must be absent regardless of its label.
    expect(header).not.toContain("OtherLabel");

    // Header + 3 data rows (one per id A, B, C).
    expect(content.trim().split("\n").length).toBe(4);
  },
);

tplTest.concurrent(
  "tableBuilder: addColumn with single-match query spec brings exactly one enrichment",
  async ({ helper, expect, driverKit }) => {
    // Spec R11: addColumn 'Expects exactly one match'. Query targets exactly
    // one column by exact name, so bquery's expectSingle is satisfied.
    const content = await runQuerySpecConsumer(
      helper,
      driverKit,
      "producer-single",
      "consumer-single",
      {
        addColumn: [
          {
            query: {
              axes: [{ anchor: "main", name: "pl7.app/id" }],
              name: "pl7.app/metric/score",
            },
            opts: { header: "ScoreCol" },
          },
        ],
      },
    );
    const header = content.trim().split("\n")[0];

    // Header is axes + primary value + the explicitly-headered single match.
    expect(header).toContain("ID");
    expect(header).toContain("Primary");
    expect(header).toContain("ScoreCol");
    // No other metric/* columns should appear.
    expect(header).not.toContain("Count");
    expect(header).not.toContain("OtherLabel");
  },
);

tplTest.concurrent(
  "tableBuilder: addColumns with zero-match query spec adds no enrichment",
  async ({ helper, expect, driverKit }) => {
    // Spec R11: addColumns 'Returns empty set on zero matches (no error)'.
    const content = await runQuerySpecConsumer(
      helper,
      driverKit,
      "producer-zero",
      "consumer-zero",
      {
        addColumns: [
          {
            query: {
              axes: [{ anchor: "main", name: "pl7.app/id" }],
              namePattern: "pl7.app/no-such/.*",
            },
            opts: { headerPrefix: "x_" },
          },
        ],
      },
    );
    const lines = content.trim().split("\n");

    // Only the primary survives; the multi-match query yielded zero columns.
    expect(lines[0]).toBe("ID\tPrimary");
    expect(lines.length).toBe(4); // header + 3 data rows
  },
);
