import { test, expect } from "vitest";
import {
  DefaultFinalResourceDataPredicate,
  field,
  NullSignedResourceId,
  TestHelpers,
} from "@milaboratories/pl-client";
import { PlTreeState } from "./state";
import { constructTreeLoadingRequest, loadTreeState } from "./sync";
import { Computable } from "@milaboratories/computable";
import { TestStructuralResourceType1 } from "./test_utils";
import * as tp from "node:timers/promises";

test("loadTreeState uses ResourceTree path with full options", async () => {
  const received: { seeds?: string[]; includeKv?: boolean; hasFilters?: boolean; hasStopRules?: boolean } = {};

  const tx = {
    resourceTree: (seeds: string[], opts?: { includeKv?: boolean; fieldFilters?: unknown[]; traverseStopRules?: unknown }) => {
      received.seeds = seeds;
      received.includeKv = opts?.includeKv;
      received.hasFilters = (opts?.fieldFilters?.length ?? 0) > 0;
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
        fields: [{ name: "keep", type: "Dynamic", value: NullSignedResourceId, error: NullSignedResourceId, status: "Resolved", valueIsFinal: false }],
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
    fieldFilters: [{}],
    traverseStopRules: {},
  } as unknown as Parameters<typeof loadTreeState>[1];

  const result = await loadTreeState(tx, request, undefined, ["treeFilter:v1"]);

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
        throw new Error("stream failed");
      })(),
  } as unknown as Parameters<typeof loadTreeState>[0];

  const request = {
    seedResources: ["NG:0x1"],
    finalResources: new Set<string>(),
  } as unknown as Parameters<typeof loadTreeState>[1];

  await expect(loadTreeState(tx, request, undefined, ["treeFilter:v1"]))
    .rejects.toThrow("stream failed");
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

  await expect(loadTreeState(tx, request, undefined, ["treeFilter:v1"]))
    .rejects.toThrow("pruning failed");
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
