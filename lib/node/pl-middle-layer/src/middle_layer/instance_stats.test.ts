import { TestHelpers } from "@milaboratories/pl-client";
import { ConsoleLoggerAdapter } from "@milaboratories/ts-helpers";
import { describe, expect, it, test } from "vitest";
import { InstanceStatsWatch, parseInstanceStats } from "./instance_stats";

const kv = (key: string, value: unknown) => ({ key, value: JSON.stringify(value) });

describe("parseInstanceStats", () => {
  it("reads every reading of a sample", () => {
    expect(
      parseInstanceStats([
        kv("reading/instance/cpu", { total: 24000, current: 18500 }),
        kv("reading/instance/ram", { total: 64e9, current: 41e9 }),
        kv("reading/instance/jobs", { running: 12, queued: 14 }),
        kv("reading/instance/source", "scheduler"),
        kv("reading/instance/kueue-shared", false),
      ]),
    ).toEqual({
      availability: "read",
      cpu: { total: 24000, current: 18500 },
      ram: { total: 64e9, current: 41e9 },
      jobs: { running: 12, queued: 14 },
      source: "scheduler",
      kueueShared: false,
    });
  });

  it("keeps a capacity whose total the source does not know", () => {
    expect(parseInstanceStats([kv("reading/instance/cpu", { current: 4000 })]).cpu).toEqual({
      current: 4000,
    });
  });

  it("leaves out a reading that is not the expected JSON, and keys of other namespaces", () => {
    const stats = parseInstanceStats([
      { key: "reading/instance/cpu", value: "not json" },
      kv("reading/instance/jobs", { running: "many" }),
      kv("reading/other/cpu", { current: 1 }),
    ]);
    expect(stats).toEqual({ availability: "read" });
  });
});

test("the watch settles on a sample, or on unsupported without the context", async () => {
  const pl = await TestHelpers.getTestClient();
  const watch = new InstanceStatsWatch(pl, new ConsoleLoggerAdapter());
  try {
    let stats = await watch.stats.getValue();
    for (let i = 0; i < 50 && stats === undefined; i++) {
      await new Promise((r) => setTimeout(r, 100));
      stats = await watch.stats.getValue();
    }
    expect(["read", "unsupported"]).toContain(stats?.availability);
  } finally {
    await watch.terminate();
    await pl.close();
  }
}, 30_000);
