import { createPFrameDriverDouble } from "@milaboratories/pf-driver";
import { test } from "vitest";
import {
  MAX_INLINE_TEXT_CHARS,
  createHeapStressTableDefinition,
  createOomTableDefinition,
  heapStressEstimate,
} from "./table";

// The double supplies local blob storage around the real native pframes engine.
// Never use the UI's stress-size defaults in automated tests.
test("joins quadratically and gives a new run a fresh table identity", async ({ expect }) => {
  await using driver = await createPFrameDriverDouble({ logger: () => {} });
  using first = driver.createPTable(createOomTableDefinition(10, 0));
  using repeated = driver.createPTable(createOomTableDefinition(10, 0));
  using nextRun = driver.createPTable(createOomTableDefinition(10, 1));

  expect(repeated.key).toBe(first.key);
  expect(nextRun.key).not.toBe(first.key);
  expect(await driver.getShape(first.key)).toEqual({ rows: 100, columns: 5 });
  expect(await driver.getShape(nextRun.key)).toEqual({ rows: 100, columns: 5 });
});

test("repeats every string value across the integer side", async ({ expect }) => {
  const params = { textRows: 4, intRows: 5, stringLength: 16, runId: 0 };
  expect(heapStressEstimate(params)).toEqual({ rows: 20, bytes: 320, inlineChars: 64 });

  await using driver = await createPFrameDriverDouble({ logger: () => {} });
  using table = driver.createPTable(createHeapStressTableDefinition(params));
  const shape = await driver.getShape(table.key);
  expect(shape).toEqual({ rows: 20, columns: 5 });

  const spec = await driver.getSpec(table.key);
  const stringIndex = spec.findIndex(
    (column) => column.type === "column" && column.spec.valueType === "String",
  );
  expect(stringIndex).toBeGreaterThanOrEqual(0);

  // One JS string per joined record is what puts the payload in the worker heap;
  // a shared or deduplicated value would make the workload harmless.
  const [values] = await driver.getData(table.key, [stringIndex], {
    offset: 0,
    length: shape.rows,
  });
  const strings = values.data as (string | null)[];
  expect(strings).toHaveLength(20);
  expect(new Set(strings).size).toBe(params.textRows);
  expect(strings.every((value) => value?.length === params.stringLength)).toBe(true);
});

test("refuses an input the model sandbox cannot build", ({ expect }) => {
  const params = { textRows: 10000, intRows: 2000, stringLength: 2000, runId: 0 };
  expect(heapStressEstimate(params).inlineChars).toBeGreaterThan(MAX_INLINE_TEXT_CHARS);
  expect(() => createHeapStressTableDefinition(params)).toThrow(/model sandbox can hold/);

  // The same payload is reachable within budget by amplifying on the integer side.
  const withinBudget = { textRows: 400, intRows: 100000, stringLength: 2000, runId: 0 };
  const estimate = heapStressEstimate(withinBudget);
  expect(estimate.inlineChars).toBeLessThanOrEqual(MAX_INLINE_TEXT_CHARS);
  expect(estimate.bytes).toBeGreaterThan(heapStressEstimate(params).bytes);
  expect(() => createHeapStressTableDefinition(withinBudget)).not.toThrow();
});
