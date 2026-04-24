import type { BlockData } from "@milaboratories/milaboratories.test-filter-column.model";
import type { platforma } from "@milaboratories/milaboratories.test-filter-column.model";
import { blockSpec as enterNumbersBlockSpec } from "@milaboratories/milaboratories.test-enter-numbers-v3";
import type { BlockData as EnterNumbersBlockData } from "@milaboratories/milaboratories.test-enter-numbers-v3.model";
import type { InferBlockState, Platforma } from "@platforma-sdk/model";
import { createPrimaryRef, wrapOutputs } from "@platforma-sdk/model";
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
  const enterNumbersId = await project.addBlock("Enter Numbers", enterNumbersBlockSpec);
  await project.mutateBlockStorage(enterNumbersId, {
    operation: "update-block-data",
    value: {
      numbers: [1, 2, 3],
      labels: ["test"],
      description: "test data",
    } satisfies EnterNumbersBlockData,
  });
  await project.runBlock(enterNumbersId);
  await helpers.awaitBlockDone(enterNumbersId, 30000);

  const blockId = await project.addBlock("Filter Column Test", blockSpec);
  const outputs = await getStableOutputs<typeof platforma>(project, blockId);

  return { blockId, outputs };
}

blockTest(
  "PrimaryRef → tableBuilder produces correct TSV",
  { timeout: 60000 },
  async ({ rawPrj: project, helpers, expect }) => {
    const { blockId, outputs } = await setupProject(project, helpers);

    const datasetOptions = outputs.datasetOptions;
    assert(datasetOptions !== undefined, "datasetOptions output missing");
    assert(datasetOptions.length > 0, "no dataset options in result pool");

    await project.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: { dataset: createPrimaryRef(datasetOptions[0].ref) } satisfies BlockData,
    });

    const finalOutputs = await runAndGetOutputs<typeof platforma>(project, helpers, blockId);

    const tableContent = finalOutputs.tableContent;
    assert(typeof tableContent === "string", "tableContent output missing");

    const lines = tableContent.trim().split("\n");

    // enter-numbers exports: axis "Index" + value "Numbers", 3 rows (0,1,2).
    expect(lines[0]).toContain("Index");
    expect(lines[0]).toContain("Numbers");
    expect(lines.length).toBe(4); // header + 3 data rows
  },
);

blockTest(
  "plain PlRef normalized to PrimaryRef, tableBuilder produces correct TSV",
  { timeout: 60000 },
  async ({ rawPrj: project, helpers, expect }) => {
    const { blockId, outputs } = await setupProject(project, helpers);

    const datasetOptions = outputs.datasetOptions;
    assert(datasetOptions !== undefined, "datasetOptions output missing");
    assert(datasetOptions.length > 0, "no dataset options in result pool");

    await project.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: { dataset: datasetOptions[0].ref } satisfies BlockData,
    });

    const finalOutputs = await runAndGetOutputs<typeof platforma>(project, helpers, blockId);

    const tableContent = finalOutputs.tableContent;
    assert(typeof tableContent === "string", "tableContent output missing");

    const lines = tableContent.trim().split("\n");
    expect(lines.length).toBe(4);
  },
);
