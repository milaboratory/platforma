import { describe, expect, test } from "vitest";
import {
  VDJ_CDR3_ID,
  anchoredColumnId,
  buildDataset,
  datasetFromTsv,
  peptideDataset,
  renderTsv,
  vdjDataset,
  vdjShape,
} from "./fixtures";

const ROWS = [
  { key: "c1", seq: "CARDYW", count: 3 },
  { key: "c2", seq: "CASSLG", count: 1, sample: "S2", label: "second" },
];

describe("renderTsv", () => {
  test("renders a header and one line per row, missing cells empty", () => {
    expect(renderTsv(["a", "b"], [{ a: 1 }, { a: "x", b: "y" }])).toBe("a\tb\n1\t\nx\ty\n");
  });

  test("rejects a cell holding a tab or line break", () => {
    expect(() => renderTsv(["a"], [{ a: "x\ty" }])).toThrow(/tab or line break/);
    expect(() => renderTsv(["a\nb"], [])).toThrow(/tab or line break/);
  });
});

describe("vdjDataset", () => {
  test("wires the anchor and the CDR3 column, and renders the rows", () => {
    const ds = vdjDataset(ROWS);
    expect(ds.anchorColumn).toBe("cellCount");
    expect(ds.sequenceId).toBe(VDJ_CDR3_ID);
    expect(ds.filterColumn).toBeUndefined();
    expect(ds.content).toBe(
      "sampleId\tclonotypeKey\tcellCount\tcdr3aa\tlabel\nS1\tc1\t3\tCARDYW\tc1\nS2\tc2\t1\tCASSLG\tsecond\n",
    );
    expect(ds.spec.partitionKeyLength).toBe(1);
    expect(ds.spec.columns.map((c) => c.payload.column)).toEqual(["cellCount", "cdr3aa", "label"]);
  });

  test("a subset adds a filter column present only for its members", () => {
    const ds = vdjDataset(ROWS, { subset: { members: ["c2"], label: "Picked" } });
    expect(ds.filterColumn).toBe("tag");
    expect(ds.content.split("\n")[1]).toBe("S1\tc1\t3\tCARDYW\tc1\t");
    expect(ds.content.split("\n")[2]).toBe("S2\tc2\t1\tCASSLG\tsecond\t1");
    const tag = ds.spec.columns.find((c) => c.payload.column === "tag")!.payload;
    expect(tag.filterOutRegex).toBe("^$");
    expect(tag.spec.annotations).toEqual({ "pl7.app/label": "Picked", "pl7.app/isSubset": "true" });
  });

  test("extra columns, extra cells and a shape rewrite compose", () => {
    const ds = vdjDataset(ROWS, {
      columns: [
        { column: "vGene", name: "pl7.app/vdj/geneHit", valueType: "String", parentAxes: [1] },
      ],
      cells: (r) => ({ vGene: r.key === "c1" ? "IGHV1" : "IGHV3" }),
      shape: (s) => ({
        ...s,
        columns: s.columns.map((c) =>
          c.column === "cellCount" ? { ...c, name: "pl7.app/vdj/readCount" } : c,
        ),
      }),
    });
    expect(ds.content.split("\n")[0]).toBe(
      "sampleId\tclonotypeKey\tcellCount\tcdr3aa\tlabel\tvGene",
    );
    expect(ds.content.split("\n")[1]).toBe("S1\tc1\t3\tCARDYW\tc1\tIGHV1");
    expect(ds.spec.columns[0].payload.spec.name).toBe("pl7.app/vdj/readCount");
  });
});

describe("buildDataset", () => {
  test("derives the sequence id from the sequence column's own axes", () => {
    const shape = vdjShape();
    shape.columns[1] = { ...shape.columns[1], parentAxes: [0, 1] };
    const ds = buildDataset(shape, []);
    expect(ds.sequenceId).toBe(
      anchoredColumnId("pl7.app/vdj/sequence", shape.columns[1].domain, [0, 1]),
    );
  });

  test("refuses a shape without an anchor; several sequence columns leave sequenceId unset", () => {
    const shape = vdjShape();
    expect(() =>
      buildDataset({ ...shape, columns: shape.columns.filter((c) => c.role !== "anchor") }, []),
    ).toThrow(/role 'anchor'/);
    const two = buildDataset(
      { ...shape, columns: [...shape.columns, { ...shape.columns[1], column: "cdr1aa" }] },
      [],
    );
    expect(two.sequenceId).toBeUndefined();
    expect(two.anchorColumn).toBe("cellCount");
  });

  test("a committed TSV is accepted only when its header matches the shape", () => {
    const shape = vdjShape();
    const ok = datasetFromTsv(
      shape,
      "sampleId\tclonotypeKey\tcellCount\tcdr3aa\tlabel\nS1\tc1\t1\tCAR\tc1\n",
    );
    expect(ok.anchorColumn).toBe("cellCount");
    expect(ok.sequenceId).toBe(VDJ_CDR3_ID);
    expect(() => datasetFromTsv(shape, "sampleId\tcellCount\n")).toThrow(/header does not match/);
  });

  test("peptide rows carry their length", () => {
    const ds = peptideDataset([{ key: "p1", seq: "SIINFEKL", count: 2 }]);
    expect(ds.content.split("\n")[1]).toBe("S1\tp1\t2\tSIINFEKL\tp1\t8");
  });
});
