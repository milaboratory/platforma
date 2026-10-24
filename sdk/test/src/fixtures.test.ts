import { describe, expect, test } from "vitest";
import {
  VDJ_CDR3_ID,
  buildDataset,
  peptideDataset,
  renderTsv,
  vdjDataset,
  vdjShape,
  xsvImportSpec,
} from "./fixtures";

const CDR3_DOMAIN = '"domain":{"pl7.app/alphabet":"aminoacid","pl7.app/vdj/feature":"CDR3"}';

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

describe("xsvImportSpec", () => {
  test("gives items ids fixed by their position", () => {
    const shape = vdjShape();
    const ids = (s: ReturnType<typeof xsvImportSpec>) => [...s.axes, ...s.columns].map((i) => i.id);
    expect(ids(xsvImportSpec(shape))).toEqual([
      "axis-0",
      "axis-1",
      "column-0",
      "column-1",
      "column-2",
    ]);
    expect(xsvImportSpec(shape)).toEqual(xsvImportSpec(shape));
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
    expect(tag.spec.name).toBe("pl7.app/vdj/subset");
    expect(tag.spec.annotations).toEqual({ "pl7.app/label": "Picked", "pl7.app/isSubset": "true" });
  });

  test("extra columns, extra cells and a shape rewrite compose", () => {
    const ds = vdjDataset(ROWS, {
      cells: (r) => ({ vGene: r.key === "c1" ? "IGHV1" : "IGHV3" }),
      shape: (s) => ({
        ...s,
        columns: [
          ...s.columns.map((c) =>
            c.column === "cellCount"
              ? { ...c, spec: { ...c.spec, name: "pl7.app/vdj/readCount" } }
              : c,
          ),
          {
            column: "vGene",
            spec: { name: "pl7.app/vdj/geneHit", valueType: "String", parentAxes: [1] },
          },
        ],
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
  test("the CDR3 id is the one the clustering block reports", () => {
    expect(VDJ_CDR3_ID).toBe(
      `{"axes":[{"anchor":"main","idx":1}],${CDR3_DOMAIN},"name":"pl7.app/vdj/sequence"}`,
    );
  });

  test("derives the sequence id from the sequence column's own axes", () => {
    const shape = vdjShape();
    shape.columns[1] = {
      ...shape.columns[1],
      spec: { ...shape.columns[1].spec, parentAxes: [0, 1] },
    };
    const ds = buildDataset(shape, []);
    expect(ds.sequenceId).toBe(
      `{"axes":[{"anchor":"main","idx":0},{"anchor":"main","idx":1}],${CDR3_DOMAIN},"name":"pl7.app/vdj/sequence"}`,
    );
  });

  test("an id carries no domain when the column has none, and anchors a shared one", () => {
    const shape = vdjShape();
    const withDomain = (anchor?: Record<string, string>, seq?: Record<string, string>) =>
      buildDataset(
        {
          ...shape,
          columns: [
            { ...shape.columns[0], spec: { ...shape.columns[0].spec, domain: anchor } },
            { ...shape.columns[1], spec: { ...shape.columns[1].spec, domain: seq } },
          ],
        },
        [],
      ).sequenceId;
    expect(withDomain()).toBe('{"axes":[{"anchor":"main","idx":1}],"name":"pl7.app/vdj/sequence"}');
    expect(withDomain({ run: "r1" }, { run: "r1", f: "x" })).toBe(
      '{"axes":[{"anchor":"main","idx":1}],"domain":{"f":"x"},"domainAnchor":"main","name":"pl7.app/vdj/sequence"}',
    );
  });

  test("refuses a shape without an anchor or with two sequences", () => {
    const shape = vdjShape();
    expect(() =>
      buildDataset({ ...shape, columns: shape.columns.filter((c) => c.role !== "anchor") }, []),
    ).toThrow(/role 'anchor'/);
    expect(() =>
      buildDataset({ ...shape, columns: [...shape.columns, shape.columns[1]] }, []),
    ).toThrow(/2 sequence columns/);
  });

  test("a sequence column without parentAxes is keyed on every axis", () => {
    const shape = vdjShape();
    const { parentAxes: _, ...spec } = shape.columns[1].spec;
    shape.columns[1] = { ...shape.columns[1], spec };
    expect(buildDataset(shape, []).sequenceId).toBe(
      `{"axes":[{"anchor":"main","idx":0},{"anchor":"main","idx":1}],${CDR3_DOMAIN},"name":"pl7.app/vdj/sequence"}`,
    );
  });

  test("refuses a separator other than tab", () => {
    expect(() => buildDataset({ ...vdjShape(), separator: "," }, [])).toThrow(/render as TSV/);
  });

  test("refuses a shape that repeats a file column", () => {
    const shape = vdjShape();
    const extra = { ...shape.columns[2], spec: { ...shape.columns[2].spec, name: "other" } };
    expect(() => buildDataset({ ...shape, columns: [...shape.columns, extra] }, [])).toThrow(
      /repeats file columns: label/,
    );
  });

  test("peptide rows carry their length", () => {
    const ds = peptideDataset([{ key: "p1", seq: "SIINFEKL", count: 2 }]);
    expect(ds.content.split("\n")[1]).toBe("S1\tp1\t2\tSIINFEKL\tp1\t8");
  });
});
