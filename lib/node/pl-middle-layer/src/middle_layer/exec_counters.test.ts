import { expect, test } from "vitest";
import { execCountersDelta } from "../debug/exec_counters";
import { withMl } from "../test/with_ml";

/**
 * The middle layer's execution counters against a live backend: a transaction the middle layer
 * runs shows up under its name in the next reading.
 */

test("a project creation is one committed transaction under its name", async () => {
  await withMl(async (ml) => {
    const before = ml.execCounters;

    await ml.createProject({ label: "counted" });

    const delta = execCountersDelta(before, ml.execCounters);
    expect(delta.transactions["MLCreateProject"]).toEqual({
      committed: 1,
      closed: 0,
      conflict: 0,
      error: 0,
    });
  });
});
