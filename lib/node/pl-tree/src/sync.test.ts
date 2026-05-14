import { test, expect } from "vitest";
import {
  CapabilityTreeFilter,
  DefaultFinalResourceDataPredicate,
  field,
  NullSignedResourceId,
  TestHelpers,
} from "@milaboratories/pl-client";
import { PlTreeState } from "./state";
import { constructTreeLoadingRequest, initialTreeLoadingStat, loadTreeState } from "./sync";
import type { TraversalMode } from "./sync";
import { Computable } from "@milaboratories/computable";
import { TestStructuralResourceType1 } from "./test_utils";
import * as tp from "node:timers/promises";

test("loadTreeState uses ResourceTree path with full options", async () => {
  const received: {
    seeds?: string[];
    includeKv?: boolean;
    hasFilters?: boolean;
    hasStopRules?: boolean;
  } = {};

  const tx = {
    resourceTree: (
      seeds: string[],
      opts?: { includeKv?: boolean; fieldFilter?: unknown; traverseStopRules?: unknown },
    ) => {
      received.seeds = seeds;
      received.includeKv = opts?.includeKv;
      received.hasFilters = opts?.fieldFilter !== undefined;
      received.hasStopRules = opts?.traverseStopRules !== undefined;

      const itemA = {
        id: "NG:0x1",
        type: { name: "Projects", version: "1" },
        kind: "Structural",
        data: undefined,
        resourceReady: false,
        error: NullSignedResourceId,
        originalResourceId: NullSignedResourceId,
        final: false,
        inputsLocked: false,
        outputsLocked: false,
        fields: [
          {
            name: "keep",
            type: "Dynamic",
            value: NullSignedResourceId,
            error: NullSignedResourceId,
            status: "Resolved",
            valueIsFinal: false,
          },
        ],
        kv: [],
        traverseWasStopped: false,
      };
      const itemSkipped = { ...itemA, id: "NG:0x2" };

      return (async function* () {
        yield itemA;
        yield itemSkipped;
      })();
    },
  } as unknown as Parameters<typeof loadTreeState>[0];

  const request = {
    seedResources: ["NG:0x1", "NG:0x2"],
    finalResources: new Set<string>(["NG:0x2"]),
    pruningFunction: (r: any) => r.fields.filter((f: any) => f.name === "keep"),
    fieldFilter: {},
    traverseStopRules: {},
  } as unknown as Parameters<typeof loadTreeState>[1];

  const result = await loadTreeState(tx, request, undefined, [CapabilityTreeFilter]);

  expect(received).toEqual({
    seeds: ["NG:0x1", "NG:0x2"],
    includeKv: true,
    hasFilters: true,
    hasStopRules: true,
  });
  expect(result).toHaveLength(1);
  expect(result[0]?.id).toBe("NG:0x1");
});

test("loadTreeState propagates ResourceTree stream failure", async () => {
  const tx = {
    resourceTree: () =>
      (async function* () {
        yield await Promise.reject(new Error("stream failed"));
      })(),
  } as unknown as Parameters<typeof loadTreeState>[0];

  const request = {
    seedResources: ["NG:0x1"],
    finalResources: new Set<string>(),
  } as unknown as Parameters<typeof loadTreeState>[1];

  await expect(loadTreeState(tx, request, undefined, [CapabilityTreeFilter])).rejects.toThrow(
    "stream failed",
  );
});

test("loadTreeState cancels ResourceTree iterator on pruning failure", async () => {
  let returnCalled = false;

  const iterable = {
    [Symbol.asyncIterator]() {
      let done = false;
      return {
        next: async () => {
          if (done) return { done: true as const, value: undefined };
          done = true;
          return {
            done: false as const,
            value: {
              id: "NG:0x1",
              type: { name: "Projects", version: "1" },
              kind: "Structural",
              data: undefined,
              resourceReady: false,
              error: NullSignedResourceId,
              originalResourceId: NullSignedResourceId,
              final: false,
              inputsLocked: false,
              outputsLocked: false,
              fields: [],
              kv: [],
              traverseWasStopped: false,
            },
          };
        },
        return: async () => {
          returnCalled = true;
          return { done: true as const, value: undefined };
        },
      };
    },
  };

  const tx = {
    resourceTree: () => iterable,
  } as unknown as Parameters<typeof loadTreeState>[0];

  const request = {
    seedResources: ["NG:0x1"],
    finalResources: new Set<string>(),
    pruningFunction: () => {
      throw new Error("pruning failed");
    },
  } as unknown as Parameters<typeof loadTreeState>[1];

  await expect(loadTreeState(tx, request, undefined, [CapabilityTreeFilter])).rejects.toThrow(
    "pruning failed",
  );
  expect(returnCalled).toBe(true);
});

test("loadTreeState falls back to BFS when capabilities are absent", async () => {
  const tx = {
    getResourceDataIfExists: async (rid: string) => ({
      id: rid,
      type: { name: "Projects", version: "1" },
      kind: "Structural",
      data: undefined,
      resourceReady: false,
      error: NullSignedResourceId,
      originalResourceId: NullSignedResourceId,
      final: false,
      inputsLocked: false,
      outputsLocked: false,
      fields: [],
    }),
    listKeyValuesIfResourceExists: async () => [],
  } as unknown as Parameters<typeof loadTreeState>[0];

  const request = {
    seedResources: ["NG:0x2"],
    finalResources: new Set<string>(),
  } as unknown as Parameters<typeof loadTreeState>[1];

  const result = await loadTreeState(tx, request, undefined, []);

  expect(result).toHaveLength(1);
  expect(result[0]?.id).toBe("NG:0x2");
});

test("load resources", async () => {
  await TestHelpers.withTempRoot(async (cl) => {
    const r1 = await cl.withWriteTx(
      "CreatingStructure1",
      async (tx) => {
        const rr1 = tx.createStruct(TestStructuralResourceType1);
        const ff1 = field(tx.clientRoot, "f1");
        tx.createField(ff1, "Dynamic");
        tx.setField(ff1, rr1);
        await tx.commit();
        return await rr1.globalId;
      },
      { sync: true },
    );

    const treeState = new PlTreeState(r1, DefaultFinalResourceDataPredicate);

    const theComputable = Computable.make((c) =>
      c.accessor(treeState.entry()).node().traverse("a", "b")?.getDataAsString(),
    );

    const refreshState = async (): Promise<void> => {
      const req = constructTreeLoadingRequest(treeState);
      const states = await cl.withReadTx("loadingTree", (tx) => loadTreeState(tx, req));
      treeState.updateFromResourceData(states);
    };

    await refreshState();

    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: false,
      value: undefined,
    });

    const r2 = await cl.withWriteTx(
      "CreatingStructure2",
      async (tx) => {
        const rr2 = tx.createStruct(TestStructuralResourceType1);
        const ff2 = field(r1, "a");
        tx.createField(ff2, "Input");
        tx.setField(ff2, rr2);
        await tx.commit();
        return await rr2.globalId;
      },
      { sync: true },
    );

    await refreshState();

    expect(theComputable.isChanged()).toBe(true);
    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: false,
      value: undefined,
    });

    await cl.withWriteTx(
      "CreatingStructure3",
      async (tx) => {
        const rr3 = tx.createValue(TestStructuralResourceType1, "hi!");
        const ff3 = field(r2, "b");
        tx.createField(ff3, "Input");
        tx.setField(ff3, rr3);
        await tx.commit();
        return await rr3.globalId;
      },
      { sync: true },
    );

    await refreshState();

    expect(theComputable.isChanged()).toBe(true);
    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: true,
      value: "hi!",
    });

    await cl.withWriteTx(
      "CreatingStructure3",
      async (tx) => {
        tx.lock(r1);
        tx.lock(r2);
        await tx.commit();
      },
      { sync: true },
    );

    // sync is not perfect, delay introduced to allow pl to propagate the state
    await tp.setTimeout(10);

    await refreshState();

    expect(theComputable.isChanged()).toBe(true);
    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: true,
      value: "hi!",
    });
  });
});

// ─── TraversalMode tests ──────────────────────────────────────────────────────

/** Build a minimal mock tx that records whether resourceTree / getResourceDataIfExists
 * was called.  Both surfaces are instrumented so we can assert which path ran. */
function buildMockTx(opts: { capable: boolean }): {
  tx: Parameters<typeof loadTreeState>[0];
  calls: { bfs: number; streaming: number };
} {
  const calls = { bfs: 0, streaming: 0 };

  const bfsResource = {
    id: "NG:0x1",
    type: { name: "Test", version: "1" },
    kind: "Structural" as const,
    data: undefined,
    resourceReady: false,
    error: NullSignedResourceId,
    originalResourceId: NullSignedResourceId,
    final: false,
    inputsLocked: false,
    outputsLocked: false,
    fields: [],
  };

  const streamingResource = {
    ...bfsResource,
    kv: [],
    traverseWasStopped: false,
  };

  const tx = {
    getResourceDataIfExists: async () => {
      calls.bfs++;
      return bfsResource;
    },
    listKeyValuesIfResourceExists: async () => [],
    resourceTree: opts.capable
      ? () => {
          calls.streaming++;
          return (async function* () {
            yield streamingResource;
          })();
        }
      : undefined,
  } as unknown as Parameters<typeof loadTreeState>[0];

  return { tx, calls };
}

const baseRequest = {
  seedResources: ["NG:0x1"],
  finalResources: new Set<string>(),
} as unknown as Parameters<typeof loadTreeState>[1];

test("traversalMode=client-bfs forces BFS on capable backend", async () => {
  const { tx, calls } = buildMockTx({ capable: true });
  const mode: TraversalMode = "client-bfs";

  const result = await loadTreeState(tx, baseRequest, undefined, [CapabilityTreeFilter], mode);

  expect(result).toHaveLength(1);
  expect(calls.bfs).toBeGreaterThan(0);
  expect(calls.streaming).toBe(0);
});

test("traversalMode=backend-streaming falls back to BFS when capability is absent, warns once", async () => {
  const { tx, calls } = buildMockTx({ capable: false });
  const mode: TraversalMode = "backend-streaming";

  const warnings: string[] = [];
  const logger = { warn: (msg: string) => warnings.push(msg) };

  const result = await loadTreeState(tx, baseRequest, undefined, [], mode, logger);

  expect(result).toHaveLength(1);
  expect(calls.bfs).toBeGreaterThan(0);
  expect(calls.streaming).toBe(0);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toMatch(/treeFilter:v1/);
});

test("traversalMode=backend-streaming uses streaming on capable backend", async () => {
  const { tx, calls } = buildMockTx({ capable: true });
  const mode: TraversalMode = "backend-streaming";

  const result = await loadTreeState(tx, baseRequest, undefined, [CapabilityTreeFilter], mode);

  expect(result).toHaveLength(1);
  expect(calls.streaming).toBeGreaterThan(0);
  expect(calls.bfs).toBe(0);
});

test("traversalMode=auto default regression: streaming on capable, BFS on incapable", async () => {
  // capable backend → streaming
  const { tx: txCap, calls: callsCap } = buildMockTx({ capable: true });
  await loadTreeState(txCap, baseRequest, undefined, [CapabilityTreeFilter]);
  expect(callsCap.streaming).toBeGreaterThan(0);
  expect(callsCap.bfs).toBe(0);

  // incapable backend → BFS
  const { tx: txNoCap, calls: callsNoCap } = buildMockTx({ capable: false });
  await loadTreeState(txNoCap, baseRequest, undefined, []);
  expect(callsNoCap.bfs).toBeGreaterThan(0);
  expect(callsNoCap.streaming).toBe(0);
});

// ─── Stop-marker handling tests ───────────────────────────────────────────────

/** Capabilities for backends that support streaming traversal. */
const stopMarkerCaps = [CapabilityTreeFilter] as const;

/** Minimal full-resource frame suitable for stop-marker tests. */
function makeFullResource(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    type: { name: "Test", version: "1" },
    kind: "Structural",
    data: undefined,
    resourceReady: false,
    error: NullSignedResourceId,
    originalResourceId: NullSignedResourceId,
    final: false,
    inputsLocked: false,
    outputsLocked: false,
    fields: [],
    kv: [],
    traverseWasStopped: false,
    ...overrides,
  };
}

/** Minimal stop-marker frame. */
function makeStopMarker(id: string): Record<string, unknown> {
  return { frameKind: "stopMarker", id, traverseWasStopped: true };
}

test("stop-marker-final-locally-skipped: marker for final id is not followed up", async () => {
  let callCount = 0;
  const tx = {
    resourceTree: () => {
      callCount++;
      return (async function* () {
        yield makeStopMarker("NG:0x1");
      })();
    },
  } as unknown as Parameters<typeof loadTreeState>[0];

  const request = {
    seedResources: ["NG:0x99"],
    finalResources: new Set<string>(["NG:0x1"]),
  } as unknown as Parameters<typeof loadTreeState>[1];

  const stats = initialTreeLoadingStat();
  const result = await loadTreeState(tx, request, stats, stopMarkerCaps);

  expect(result).toHaveLength(0);
  expect(stats.stopMarkersSkipped).toBe(1);
  expect(callCount).toBe(1); // no follow-up call issued
});

test("stop-marker-unknown-triggers-followup: unknown marker fetched in follow-up", async () => {
  let callCount = 0;
  const tx = {
    resourceTree: () => {
      callCount++;
      if (callCount === 1) {
        // Round 0: emit a stop marker for an unknown id
        return (async function* () {
          yield makeStopMarker("NG:0x1");
        })();
      } else {
        // Follow-up: return full resource for that id
        return (async function* () {
          yield makeFullResource("NG:0x1");
        })();
      }
    },
  } as unknown as Parameters<typeof loadTreeState>[0];

  const request = {
    seedResources: ["NG:0x99"],
    finalResources: new Set<string>(),
  } as unknown as Parameters<typeof loadTreeState>[1];

  const stats = initialTreeLoadingStat();
  const result = await loadTreeState(tx, request, stats, stopMarkerCaps);

  expect(result).toHaveLength(1);
  expect(result[0]?.id).toBe("NG:0x1");
  expect(stats.stopMarkerFollowUpRoundTrips).toBe(1);
  expect(callCount).toBe(2);
});

test("legacy-backend-compat: no stop markers in stream → no follow-up call", async () => {
  // Old backends emit only full-resource frames; pendingFollowUp stays empty
  // and the follow-up loop body never executes.
  let callCount = 0;
  const tx = {
    resourceTree: () => {
      callCount++;
      return (async function* () {
        yield makeFullResource("NG:0x1");
      })();
    },
  } as unknown as Parameters<typeof loadTreeState>[0];

  const request = {
    seedResources: ["NG:0x1"],
    finalResources: new Set<string>(),
  } as unknown as Parameters<typeof loadTreeState>[1];

  const stats = initialTreeLoadingStat();
  const result = await loadTreeState(tx, request, stats, [CapabilityTreeFilter]);

  expect(result).toHaveLength(1);
  expect(callCount).toBe(1);
  expect(stats.stopMarkerFollowUpRoundTrips).toBe(0);
});

test("orphan-invariant-preserved: error referent streamed alongside stop marker", async () => {
  // Server streams the error referent (errY) as a normal frame and the
  // stopped node (X) as a stop marker.  Follow-up returns X as a full
  // resource with error pointing to errY.  Both should appear in the result.
  const errY = makeFullResource("NG:0xE", { final: true, inputsLocked: true, outputsLocked: true });
  const stoppedX = makeFullResource("NG:0x1", {
    error: "NG:0xE", // X's error field points to errY
    traverseWasStopped: true,
  });

  let callCount = 0;
  const tx = {
    resourceTree: () => {
      callCount++;
      if (callCount === 1) {
        return (async function* () {
          yield errY; // error referent — normal frame
          yield makeStopMarker("NG:0x1"); // stopped node — marker frame
        })();
      } else {
        return (async function* () {
          yield stoppedX; // follow-up returns full resource
        })();
      }
    },
  } as unknown as Parameters<typeof loadTreeState>[0];

  const request = {
    seedResources: ["NG:0x1"],
    finalResources: new Set<string>(),
  } as unknown as Parameters<typeof loadTreeState>[1];

  const result = await loadTreeState(tx, request, undefined, stopMarkerCaps);

  // Both the error referent and the stopped resource must be present
  const ids = result.map((r) => r.id).sort();
  expect(ids).toEqual(["NG:0x1", "NG:0xE"]);
  // No throw means the invariant held throughout loadTreeState
});
