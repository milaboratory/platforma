import * as tp from "node:timers/promises";
import { expect, test } from "vitest";
import { execCountersDelta } from "../debug/exec_counters";
import { withMl } from "../test/with_ml";
import type { MiddleLayer } from "./middle_layer";

/**
 * Project maintenance against a live backend: a project nobody changes opens no maintenance
 * transactions, and a change that leaves work behind gets it done without a periodic loop.
 */

test("an idle open project opens no maintenance transactions", async () => {
  await withMl(async (ml) => {
    const id = await ml.createProject({ label: "idle" });
    await ml.openProject(id);
    await ml.getOpenedProject(id).overview.awaitStableValue();
    // lets the tree stop polling after the reads of the open
    await tp.setTimeout(1500);

    const transactions = await transactionsDuring(ml, 3000);
    expect(transactions["ProjectAction: maintenance"]).toBeUndefined();
    expect(transactions["ProjectAction: doRefresh"]).toBeUndefined();
  });
});

test("a block added to an open project gets its staging from maintenance, then the project goes quiet", async () => {
  await withMl(async (ml) => {
    const id = await ml.createProject({ label: "adding" });
    await ml.openProject(id);
    const prj = ml.getOpenedProject(id);
    await prj.overview.awaitStableValue();

    const before = ml.execCounters;
    await prj.addBlock("Block 1", EnterNumbers);
    await prj.addBlock("Block 2", EnterNumbers);

    const deadline = Date.now() + 15_000;
    while (
      (execCountersDelta(before, ml.execCounters).transactions["ProjectAction: maintenance"]
        ?.committed ?? 0) === 0
    ) {
      if (Date.now() > deadline) throw new Error("no maintenance pass committed in 15 s");
      await tp.setTimeout(100);
    }

    await tp.setTimeout(3000);
    const transactions = await transactionsDuring(ml, 3000);
    expect(transactions["ProjectAction: maintenance"]).toBeUndefined();
  });
});

test("deleting a block releases its state at once", async () => {
  await withMl(async (ml) => {
    const id = await ml.createProject({ label: "deleting" });
    await ml.openProject(id);
    const prj = ml.getOpenedProject(id);
    const blockId = await prj.addBlock("Block 1", EnterNumbers);
    await prj.getBlockState(blockId).getValue();

    await prj.deleteBlock(blockId);
    expect(() => prj.getBlockState(blockId)).toThrow(/deleted/);
  });
});

// Internals

const EnterNumbers = {
  type: "from-registry-v1",
  registryUrl: "https://block.registry.platforma.bio/releases",
  id: { organization: "milaboratory", name: "enter-numbers", version: "1.1.1" },
} as const;

async function transactionsDuring(ml: MiddleLayer, ms: number) {
  const before = ml.execCounters;
  await tp.setTimeout(ms);
  return execCountersDelta(before, ml.execCounters).transactions;
}
