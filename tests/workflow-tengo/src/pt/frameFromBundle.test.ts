import type { ComputableCtx } from '@milaboratories/computable';
import { getTestTimeout } from '@milaboratories/test-helpers';
import type { AnchoredPColumnId, FilteredPColumnId, MiddleLayerDriverKit } from '@milaboratories/pl-middle-layer';
import { canonicalizeJson } from '@milaboratories/pl-middle-layer';
import type { PlTreeNodeAccessor } from '@milaboratories/pl-tree';
import type { TestWorkflowResults } from '@platforma-sdk/test';
import { awaitStableState, tplTest } from '@platforma-sdk/test';
import { expect } from 'vitest';

const TIMEOUT = getTestTimeout(30_000);

tplTest(
  'pt frameFromColumnBundle test - should return frame from column bundle with filtered columns',
  async ({ helper, expect, driverKit }) => {
    const wf1 = await helper.renderWorkflow('pt.frameFromBundle.pool', false, {
      pColumnsData: [
        clusterResolutionPColumnData,
        totalCountsPColumnData,
        complexityPColumnData,
        expressionPColumnData,
      ],
    }, { blockId: 'b1' });

    const ctx = await awaitStableState(wf1.context());

    const wf2 = await helper.renderWorkflow('pt.frameFromBundle.exports', false, {
      axes: [
        { column: sampleIdAxesSpec.name, spec: sampleIdAxesSpec },
        { column: cellIdAxesSpec.name, spec: cellIdAxesSpec },
        { column: geneIdAxesSpec.name, spec: geneIdAxesSpec },
      ],
      columnIds: [
        canonicalizeJson<AnchoredPColumnId>({
          name: 'clusterResolution',
          axes: [sampleIdAxesSpec],
        }),
        canonicalizeJson<AnchoredPColumnId>({
          name: 'totalCounts',
          axes: [
            sampleIdAxesSpec,
            cellIdAxesSpec,
          ],
        }),
        canonicalizeJson<FilteredPColumnId>({
          source: {
            name: 'expression',
            axes: [
              sampleIdAxesSpec,
              cellIdAxesSpec,
              geneIdAxesSpec,
            ],
          },
          axisFilters: [[2, 'gene_1']],
        }),
        canonicalizeJson<FilteredPColumnId>({
          source: {
            name: 'complexity',
            axes: [
              sampleIdAxesSpec,
              cellIdAxesSpec,
              geneIdAxesSpec,
            ],
          },
          axisFilters: [[2, 'gene_3']],
        }),
      ],
    }, { blockId: 'b2', parent: ctx });

    const csvHandle = await getCsvHandle(wf2, driverKit, 'file');
    const csvContent = await readBlobAsString(driverKit, csvHandle);

    expect(csvContent).eq(
      `sampleId\tcellId\t_axes_name_sampleId_type_String_name_cellId_type_String_name_totalCounts_\t_axes_name_sampleId_type_String_name_clusterResolution_\t"{""axisFilters"":[[2,""gene_1""]],""source"":{""axes"":[{""name"":""sampleId"",""type"":""String""},{""name"":""cellId"",""type"":""String""},{""name"":""geneId"",""type"":""String""}],""name"":""expression""}}"\t"{""axisFilters"":[[2,""gene_3""]],""source"":{""axes"":[{""name"":""sampleId"",""type"":""String""},{""name"":""cellId"",""type"":""String""},{""name"":""geneId"",""type"":""String""}],""name"":""complexity""}}"`
      + `\n1\tcell_1\t3000\tCL-1\t5.0\t0.815`
      + `\n1\tcell_2\t4000\tCL-1\t7.0\t0.513`
      + `\n1\tcell_3\t3500\tCL-1\t8.0\t0.914`
      + `\n2\tcell_1\t5000\tCL-2\t20.0\t0.73`
      + `\n2\tcell_2\t6000\tCL-2\t22.0\t0.932`
      + `\n2\tcell_3\t5500\tCL-2\t24.0\t0.934`
      + `\n3\tcell_1\t7000\tCL-3\t120.0\t0.33`
      + `\n3\tcell_2\t8000\tCL-3\t122.0\t0.132`
      + `\n3\tcell_3\t7500\tCL-3\t124.0\t0.534\n`,
    );
  }, {
    concurrent: true,
    timeout: TIMEOUT,
  },
);

export async function getCsvHandle(
  result: TestWorkflowResults,
  driverKit: MiddleLayerDriverKit,
  outputName: string,
  timeout = TIMEOUT,
) {
  const handle = await awaitStableState(
    result.output(outputName, (f: PlTreeNodeAccessor | undefined, ctx: ComputableCtx) => {
      if (!f) {
        return undefined;
      }
      return driverKit.blobDriver.getOnDemandBlob(f.persist(), ctx).handle;
    }),
    timeout,
  );
  expect(handle).toBeDefined();
  return handle!;
}

type BlobHandle = ReturnType<MiddleLayerDriverKit['blobDriver']['getOnDemandBlob']>['handle'];

export async function readBlobAsString(driverKit: MiddleLayerDriverKit, handle: BlobHandle) {
  return (await driverKit.blobDriver.getContent(handle)).toString();
}

const sampleIdAxesSpec = {
  name: 'sampleId',
  type: 'String',
} as const;

const cellIdAxesSpec = {
  name: 'cellId',
  type: 'String',
} as const;

const geneIdAxesSpec = {
  name: 'geneId',
  type: 'String',
} as const;

const clusterResolutionSpec = {
  kind: 'PColumn',
  name: 'clusterResolution',
  valueType: 'String',
  axesSpec: [
    sampleIdAxesSpec,
  ],
} as const;
const clusterResolutionCSV = `sampleId,clusterResolution
1,CL-1
2,CL-2
3,CL-3`;

const totalCountsSpec = {
  kind: 'PColumn',
  name: 'totalCounts',
  valueType: 'Int',
  axesSpec: [
    sampleIdAxesSpec,
    cellIdAxesSpec,
  ],
} as const;
const totalCountsCSV = `sampleId,cellId,totalCounts
1,cell_1,3000
1,cell_2,4000
1,cell_3,3500
2,cell_1,5000
2,cell_2,6000
2,cell_3,5500
3,cell_1,7000
3,cell_2,8000
3,cell_3,7500`;

const complexitySpec = {
  kind: 'PColumn',
  name: 'complexity',
  valueType: 'Float',
  axesSpec: [
    sampleIdAxesSpec,
    cellIdAxesSpec,
    geneIdAxesSpec,
  ],
} as const;
const complexityCSV = `sampleId,cellId,geneId,complexity
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
3,cell_3,gene_3,0.534`;

const expressionSpec = {
  kind: 'PColumn',
  name: 'expression',
  valueType: 'Float',
  axesSpec: [
    sampleIdAxesSpec,
    cellIdAxesSpec,
    geneIdAxesSpec,
  ],
} as const;
const expressionCSV = `sampleId,cellId,geneId,expression
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
3,cell_3,gene_3,134`;

const clusterResolutionPColumnData = {
  data: clusterResolutionCSV,
  axes: [{ column: sampleIdAxesSpec.name, spec: sampleIdAxesSpec }],
  columns: [{ column: clusterResolutionSpec.name, spec: clusterResolutionSpec }],
};
const totalCountsPColumnData = {
  data: totalCountsCSV,
  axes: [{ column: sampleIdAxesSpec.name, spec: sampleIdAxesSpec }, { column: cellIdAxesSpec.name, spec: cellIdAxesSpec }],
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
