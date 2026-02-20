import type { AnchoredPColumnId, FilteredPColumnId } from "@milaboratories/pl-middle-layer";
import { canonicalizeJson, createPlRef } from "@milaboratories/pl-middle-layer";
import { awaitStableState, tplTest } from "@platforma-sdk/test";
import dedent from "dedent";
import { vi } from "vitest";
import { Timeout, getFileContent } from "./helpers";

vi.setConfig({ testTimeout: Timeout });

tplTest.concurrent(
  "pt frameFromColumnBundle test - should return frame from column bundle with filtered columns",
  async ({ helper, expect, driverKit }) => {
    const wf1 = await helper.renderWorkflow(
      "pt.frameFromBundle.pool",
      false,
      {
        pColumnsData: [
          clusterResolutionPColumnData,
          totalCountsPColumnData,
          complexityPColumnData,
          expressionPColumnData,
        ],
      },
      { blockId: "b1" },
    );

    const ctx = await awaitStableState(wf1.context());

    const wf2 = await helper.renderWorkflow(
      "pt.frameFromBundle.exports",
      false,
      {
        axes: [sampleIdAxesSpec, cellIdAxesSpec],
        anchor: createPlRef("b1", "data"),
        columnIds: [
          canonicalizeJson<AnchoredPColumnId>({
            name: "totalCounts",
            axes: [sampleIdAxesSpec, cellIdAxesSpec],
          }),
          canonicalizeJson<AnchoredPColumnId>({
            name: "clusterResolution",
            axes: [sampleIdAxesSpec],
          }),
          canonicalizeJson<FilteredPColumnId>({
            source: {
              name: "expression",
              axes: [sampleIdAxesSpec, cellIdAxesSpec, geneIdAxesSpec],
            },
            axisFilters: [[2, "gene_1"]],
          }),
          canonicalizeJson<FilteredPColumnId>({
            source: {
              name: "complexity",
              axes: [sampleIdAxesSpec, cellIdAxesSpec, geneIdAxesSpec],
            },
            axisFilters: [[2, "gene_3"]],
          }),
        ],
      },
      { blockId: "b2", parent: ctx },
    );

    const csvContent = await getFileContent(wf2, "file", driverKit);
    const lines = csvContent.trim().split("\n");

    // Check header columns
    const headerCols = lines[0].split(/\s+/);
    expect(headerCols).toHaveLength(6);
    expect(headerCols[0]).toContain('"sampleId"');
    expect(headerCols[1]).toContain('"cellId"');
    expect(headerCols[2]).toContain('"totalCounts"');
    expect(headerCols[3]).toContain('"clusterResolution"');
    expect(headerCols[4]).toContain('"expression"');
    expect(headerCols[5]).toContain('"complexity"');

    // Check data rows
    expect(lines).toHaveLength(10); // 1 header + 9 data rows

    const expectedRows = [
      ["1", "cell_1", "3000", "CL-1", "5.0", "0.815"],
      ["1", "cell_2", "4000", "CL-1", "7.0", "0.513"],
      ["1", "cell_3", "3500", "CL-1", "8.0", "0.914"],
      ["2", "cell_1", "5000", "CL-2", "20.0", "0.73"],
      ["2", "cell_2", "6000", "CL-2", "22.0", "0.932"],
      ["2", "cell_3", "5500", "CL-2", "24.0", "0.934"],
      ["3", "cell_1", "7000", "CL-3", "120.0", "0.33"],
      ["3", "cell_2", "8000", "CL-3", "122.0", "0.132"],
      ["3", "cell_3", "7500", "CL-3", "124.0", "0.534"],
    ];

    for (let i = 0; i < expectedRows.length; i++) {
      const actualCols = lines[i + 1].split(/\s+/);
      const expectedCols = expectedRows[i];
      expect(actualCols).toEqual(expectedCols);
    }
  },
);

const sampleIdAxesSpec = {
  name: "sampleId",
  type: "String",
} as const;

const cellIdAxesSpec = {
  name: "cellId",
  type: "String",
} as const;

const geneIdAxesSpec = {
  name: "geneId",
  type: "String",
} as const;

const clusterResolutionSpec = {
  kind: "PColumn",
  name: "clusterResolution",
  valueType: "String",
  axesSpec: [sampleIdAxesSpec],
} as const;
const clusterResolutionCSV = dedent`
  sampleId,clusterResolution
  1,CL-1
  2,CL-2
  3,CL-3
`;

const totalCountsSpec = {
  kind: "PColumn",
  name: "totalCounts",
  valueType: "Int",
  axesSpec: [sampleIdAxesSpec, cellIdAxesSpec],
} as const;
const totalCountsCSV = dedent`
  sampleId,cellId,totalCounts
  1,cell_1,3000
  1,cell_2,4000
  1,cell_3,3500
  2,cell_1,5000
  2,cell_2,6000
  2,cell_3,5500
  3,cell_1,7000
  3,cell_2,8000
  3,cell_3,7500
`;

const complexitySpec = {
  kind: "PColumn",
  name: "complexity",
  valueType: "Float",
  axesSpec: [sampleIdAxesSpec, cellIdAxesSpec, geneIdAxesSpec],
} as const;
const complexityCSV = dedent`
  sampleId,cellId,geneId,complexity
  1,cell_1,gene_1,0.75
  1,cell_1,gene_2,0.710
  1,cell_1,gene_3,0.815
  1,cell_2,gene_1,0.87
  1,cell_2,gene_2,0.711
  1,cell_2,gene_3,0.513
  1,cell_3,gene_1,0.58
  1,cell_3,gene_2,0.712
  1,cell_3,gene_3,0.914
  2,cell_1,gene_1,0.920
  2,cell_1,gene_2,0.925
  2,cell_1,gene_3,0.730
  2,cell_2,gene_1,0.522
  2,cell_2,gene_2,0.227
  2,cell_2,gene_3,0.932
  2,cell_3,gene_1,0.324
  2,cell_3,gene_2,0.929
  2,cell_3,gene_3,0.934
  3,cell_1,gene_1,0.120
  3,cell_1,gene_2,0.125
  3,cell_1,gene_3,0.330
  3,cell_2,gene_1,0.122
  3,cell_2,gene_2,0.527
  3,cell_2,gene_3,0.132
  3,cell_3,gene_1,0.824
  3,cell_3,gene_2,0.629
  3,cell_3,gene_3,0.534
`;

const expressionSpec = {
  kind: "PColumn",
  name: "expression",
  valueType: "Float",
  axesSpec: [sampleIdAxesSpec, cellIdAxesSpec, geneIdAxesSpec],
} as const;
const expressionCSV = dedent`
  sampleId,cellId,geneId,expression
  1,cell_1,gene_1,5
  1,cell_1,gene_2,10
  1,cell_1,gene_3,15
  1,cell_2,gene_1,7
  1,cell_2,gene_2,11
  1,cell_2,gene_3,13
  1,cell_3,gene_1,8
  1,cell_3,gene_2,12
  1,cell_3,gene_3,14
  2,cell_1,gene_1,20
  2,cell_1,gene_2,25
  2,cell_1,gene_3,30
  2,cell_2,gene_1,22
  2,cell_2,gene_2,27
  2,cell_2,gene_3,32
  2,cell_3,gene_1,24
  2,cell_3,gene_2,29
  2,cell_3,gene_3,34
  3,cell_1,gene_1,120
  3,cell_1,gene_2,125
  3,cell_1,gene_3,130
  3,cell_2,gene_1,122
  3,cell_2,gene_2,127
  3,cell_2,gene_3,132
  3,cell_3,gene_1,124
  3,cell_3,gene_2,129
  3,cell_3,gene_3,134
`;

const clusterResolutionPColumnData = {
  data: clusterResolutionCSV,
  axes: [{ column: sampleIdAxesSpec.name, spec: sampleIdAxesSpec }],
  columns: [{ column: clusterResolutionSpec.name, spec: clusterResolutionSpec }],
};
const totalCountsPColumnData = {
  data: totalCountsCSV,
  axes: [
    { column: sampleIdAxesSpec.name, spec: sampleIdAxesSpec },
    { column: cellIdAxesSpec.name, spec: cellIdAxesSpec },
  ],
  columns: [{ column: totalCountsSpec.name, spec: totalCountsSpec }],
};
const complexityPColumnData = {
  data: complexityCSV,
  axes: [
    { column: sampleIdAxesSpec.name, spec: sampleIdAxesSpec },
    { column: cellIdAxesSpec.name, spec: cellIdAxesSpec },
    { column: geneIdAxesSpec.name, spec: geneIdAxesSpec },
  ],
  columns: [{ column: complexitySpec.name, spec: complexitySpec }],
};
const expressionPColumnData = {
  data: expressionCSV,
  axes: [
    { column: sampleIdAxesSpec.name, spec: sampleIdAxesSpec },
    { column: cellIdAxesSpec.name, spec: cellIdAxesSpec },
    { column: geneIdAxesSpec.name, spec: geneIdAxesSpec },
  ],
  columns: [{ column: expressionSpec.name, spec: expressionSpec }],
};
