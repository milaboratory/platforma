import type { BlockData } from "@milaboratories/milaboratories.test-filter-column.model";
import type { platforma } from "@milaboratories/milaboratories.test-filter-column.model";
import { blockSpec as tableTestBlockSpec } from "@milaboratories/milaboratories.test-block-table";
import type { InferBlockState, Platforma } from "@platforma-sdk/model";
import { createDatasetSelection, createPrimaryRef, wrapOutputs } from "@platforma-sdk/model";
import type { ML, RawHelpers } from "@platforma-sdk/test";
import { awaitStableState, blockTest } from "@platforma-sdk/test";
import { blockSpec } from "this-block";
import { assert } from "vitest";

async function getStableOutputs<Pl extends Platforma>(
  project: ML.Project,
  blockId: string,
  timeout: number = 30000,
) {
  const state = (await awaitStableState(
    project.getBlockState(blockId),
    timeout,
  )) as InferBlockState<Pl>;
  return wrapOutputs(state.outputs);
}

async function runAndGetOutputs<Pl extends Platforma>(
  project: ML.Project,
  helpers: RawHelpers,
  blockId: string,
  timeout: number = 30000,
) {
  await project.runBlock(blockId);
  const state = await helpers.awaitBlockDoneAndGetStableBlockState<Pl>(blockId, timeout);
  return wrapOutputs(state.outputs);
}

async function setupProject(project: ML.Project, helpers: RawHelpers) {
  // Upstream block exports primaries + linker chain; this block whitelists
  // `value` / `description` as primaries, the rest become enrichments.
  const tableTestId = await project.addBlock("Table Test Source", tableTestBlockSpec);
  await project.runBlock(tableTestId);
  await helpers.awaitBlockDone(tableTestId, 30000);

  const blockId = await project.addBlock("Filter Column Test", blockSpec);
  const outputs = await getStableOutputs<typeof platforma>(project, blockId);

  return { blockId, outputs };
}

blockTest(
  "buildDatasetOptions surfaces whitelisted primaries from table-test",
  { timeout: 60000 },
  async ({ rawPrj: project, helpers, expect }) => {
    const { outputs } = await setupProject(project, helpers);

    const datasetOptions = outputs.datasetOptions;
    assert(datasetOptions !== undefined, "datasetOptions output missing");
    expect(datasetOptions.length).toBeGreaterThan(0);

    const labels = datasetOptions.map((o) => o.primary.label).sort();
    expect(labels).toEqual(["Description", "Value"].sort());
  },
);

blockTest(
  "PrimaryRef → tableBuilder produces a TSV for the picked primary",
  { timeout: 60000 },
  async ({ rawPrj: project, helpers, expect }) => {
    const { blockId, outputs } = await setupProject(project, helpers);

    const datasetOptions = outputs.datasetOptions;
    assert(datasetOptions !== undefined, "datasetOptions output missing");

    const valueOption = datasetOptions.find((o) => o.primary.label === "Value");
    assert(valueOption !== undefined, "no `Value` option");

    await project.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: {
        dataset: createDatasetSelection(createPrimaryRef(valueOption.primary.ref)),
      } satisfies BlockData,
    });

    const finalOutputs = await runAndGetOutputs<typeof platforma>(project, helpers, blockId);

    const tableContent = finalOutputs.tableContent;
    assert(typeof tableContent === "string", "tableContent output missing");

    const lines = tableContent.trim().split("\n");
    expect(lines.length).toBe(6); // header + 5 rows (A–E on `name`)
    expect(lines[0]).toContain("Value");
  },
);

blockTest(
  "EnrichmentRef from buildDatasetOptions joins via the linker column",
  { timeout: 60000 },
  async ({ rawPrj: project, helpers, expect }) => {
    const { blockId, outputs } = await setupProject(project, helpers);

    const datasetOptions = outputs.datasetOptions;
    assert(datasetOptions !== undefined, "datasetOptions output missing");

    const enriched = datasetOptions.find(
      (o) => (o.enrichments?.length ?? 0) > 0 && o.primary.label === "Value",
    );
    assert(enriched !== undefined, "no option with enrichments for `Value`");
    assert(enriched.enrichments !== undefined && enriched.enrichments.length > 0);

    await project.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: {
        dataset: createDatasetSelection(
          createPrimaryRef(enriched.primary.ref),
          enriched.enrichments,
        ),
      } satisfies BlockData,
    });

    const finalOutputs = await runAndGetOutputs<typeof platforma>(project, helpers, blockId);

    const tsv = finalOutputs.tableContentLinker;
    assert(typeof tsv === "string", "tableContentLinker output missing");

    const lines = tsv.trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines[0]).toContain("Name");
    expect(lines[0]).toContain("Value");
  },
);
