import { createPFrameDriverDouble } from "@milaboratories/pf-driver";
import { test } from "vitest";
import { createOomTableDefinition } from "./table";

// The double supplies local blob storage around the real native pframes engine.
// Never use the UI's stress-size default in automated tests.
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
