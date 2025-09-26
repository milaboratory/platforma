import type { ComputableCtx } from '@milaboratories/computable';
import { getTestTimeout } from '@milaboratories/helpers';
import type { AnchoredPColumnId, FilteredPColumnId, MiddleLayerDriverKit } from '@milaboratories/pl-middle-layer';
import { canonicalizeJson } from '@milaboratories/pl-middle-layer';
import type { PlTreeNodeAccessor } from '@milaboratories/pl-tree';
import type { TestWorkflowResults } from '@platforma-sdk/test';
import { awaitStableState, tplTest } from '@platforma-sdk/test';
import { expect } from 'vitest';

const TIMEOUT = getTestTimeout(30_000);

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

tplTest(
  'frameFromColumnBundle: should return frame from column bundle with filtered columns',
  async ({ helper, expect, driverKit }) => {
    const wf1 = await helper.renderWorkflow('pframes.test.frameFromBundle.pool', false, {}, { blockId: 'b1' });

    const ctx = await awaitStableState(wf1.context());

    const wf2 = await helper.renderWorkflow('pframes.test.frameFromBundle.exports', false, {
      columnIds: [
        canonicalizeJson<AnchoredPColumnId>({
          name: 'clusterResolution',
          axes: [{ name: 'sampleId', type: 'String' }],
        }),
        canonicalizeJson<AnchoredPColumnId>({
          name: 'totalCounts',
          axes: [
            { name: 'sampleId', type: 'String' },
            { name: 'cellId', type: 'String' },
          ],
        }),
        canonicalizeJson<FilteredPColumnId>({
          source: {
            name: 'expression',
            axes: [
              { name: 'sampleId', type: 'String' },
              { name: 'cellId', type: 'String' },
              { name: 'geneId', type: 'String' },
            ],
          },
          axisFilters: [[2, 'gene_1']],
        }),
        canonicalizeJson<FilteredPColumnId>({
          source: {
            name: 'complexity',
            axes: [
              { name: 'sampleId', type: 'String' },
              { name: 'cellId', type: 'String' },
              { name: 'geneId', type: 'String' },
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
  },
  { concurrent: true },
);
