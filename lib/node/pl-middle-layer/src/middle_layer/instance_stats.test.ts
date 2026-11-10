import { TestHelpers } from "@milaboratories/pl-client";
import { ConsoleLoggerAdapter } from "@milaboratories/ts-helpers";
import { describe, expect, it, test } from "vitest";
import type { BackendCapability, SignedResourceId } from "@milaboratories/pl-client";
import { createSignedResourceId } from "@milaboratories/pl-client";
import type { InstanceStatsClient } from "./instance_stats";
import { InstanceStatsCapability, InstanceStatsWatch, parseInstanceStats } from "./instance_stats";

const kv = (key: string, value: unknown) => ({ key, value: JSON.stringify(value) });

describe("parseInstanceStats", () => {
  it("reads every reading of a sample", () => {
    expect(
      parseInstanceStats([
        kv("reading/instance/cpu", { total: 24000, current: 18500 }),
        kv("reading/instance/ram", { total: 64e9, current: 41e9 }),
        kv("reading/instance/jobs", { running: 12, queued: 14 }),
        kv("reading/instance/source", "scheduler"),
      ]),
    ).toEqual({
      status: "ok",
      cpu: { total: 24000, current: 18500 },
      ram: { total: 64e9, current: 41e9 },
      jobs: { running: 12, queued: 14 },
      source: "scheduler",
    });
  });

  it("reads the GPU devices and GPU memory, and no GPU count from a null reading", () => {
    const stats = parseInstanceStats([
      kv("reading/instance/gpu", { total: 8, current: 3 }),
      kv("reading/instance/gpu-memory", null),
    ]);
    expect(stats.gpu).toEqual({ total: 8, current: 3 });
    expect(stats.gpuMemory).toBeUndefined();
    expect(
      parseInstanceStats([kv("reading/instance/gpu-memory", { total: 24e9, current: 12e9 })])
        .gpuMemory,
    ).toEqual({ total: 24e9, current: 12e9 });
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
    expect(stats).toEqual({ status: "ok" });
  });
});

test("the watch reads a sample where the capability is advertised, and nothing elsewhere", async () => {
  const pl = await TestHelpers.getTestClient();
  const watch = new InstanceStatsWatch(pl, new ConsoleLoggerAdapter());
  try {
    let stats = await watch.stats.getValue();
    for (let i = 0; i < 50 && stats === undefined; i++) {
      await new Promise((r) => setTimeout(r, 100));
      stats = await watch.stats.getValue();
    }
    expect(stats?.status).toEqual(pl.hasCapability(InstanceStatsCapability) ? "ok" : "unsupported");
  } finally {
    await watch.terminate();
    await pl.close();
  }
}, 30_000);

/** A client that advertises `capabilities` and serves one context with `kvs`, or none. */
function fakeClient(opts: {
  capabilities: BackendCapability[];
  context?: { key: string; value: string }[];
}): InstanceStatsClient & { listed: number } {
  const ref = createSignedResourceId(7n);
  const client = {
    listed: 0,
    hasCapability: (c: BackendCapability) => opts.capabilities.includes(c),
    listSharedResourcesByType: async (_name: string): Promise<SignedResourceId[]> => {
      client.listed++;
      return opts.context === undefined ? [] : [ref];
    },
    withReadTx: async <T>(
      _name: string,
      body: (tx: {
        listKeyValuesString(rId: SignedResourceId): Promise<{ key: string; value: string }[]>;
      }) => Promise<T>,
    ) => await body({ listKeyValuesString: async () => opts.context ?? [] }),
  };
  return client;
}

async function firstSample(client: InstanceStatsClient) {
  const watch = new InstanceStatsWatch(client, new ConsoleLoggerAdapter());
  try {
    for (let i = 0; i < 50; i++) {
      const stats = await watch.stats.getValue();
      if (stats !== undefined) return stats;
      await new Promise((r) => setTimeout(r, 20));
    }
    return undefined;
  } finally {
    await watch.terminate();
  }
}

describe("InstanceStatsWatch", () => {
  it("does nothing on a backend that does not advertise the capability", async () => {
    const client = fakeClient({ capabilities: [] });
    expect(await firstSample(client)).toEqual({ status: "unsupported" });
    expect(client.listed).toBe(0);
  });

  it("reports unsupported when the capability is advertised but the context is missing", async () => {
    const client = fakeClient({ capabilities: [InstanceStatsCapability] });
    expect(await firstSample(client)).toEqual({ status: "unsupported" });
    expect(client.listed).toBe(1);
  });

  it("reads the context's readings, and nothing when its writer is off", async () => {
    const sample = [kv("reading/instance/jobs", { running: 1, queued: 2 })];
    expect(
      await firstSample(fakeClient({ capabilities: [InstanceStatsCapability], context: sample })),
    ).toEqual({ status: "ok", jobs: { running: 1, queued: 2 } });
    expect(
      await firstSample(fakeClient({ capabilities: [InstanceStatsCapability], context: [] })),
    ).toEqual({ status: "ok" });
  });
});
