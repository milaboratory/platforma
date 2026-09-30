import { test, expect } from "vitest";
import { DefaultFinalResourceDataPredicate, field, TestHelpers } from "@milaboratories/pl-client";
import type {
  FinalResourceDataPredicate,
  PlClient,
  SignedResourceId,
} from "@milaboratories/pl-client";
import { TestStructuralResourceType1 } from "./test_utils";
import { Computable } from "@milaboratories/computable";
import { SynchronizedTreeState } from "./synchronized_tree";
import { ConsoleLoggerAdapter } from "@milaboratories/ts-helpers";
import tp from "timers/promises";

test("simple synchronized tree test", async () => {
  await TestHelpers.withTempRoot(async (pl) => {
    const r1 = await pl.withWriteTx(
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

    const treeState = await SynchronizedTreeState.init(
      pl,
      r1,
      {
        stopPollingDelay: 10,
        pollingInterval: 10,
        logStat: "cumulative",
      },
      new ConsoleLoggerAdapter(require("console")),
    );

    const theComputable = Computable.make((c) =>
      c.accessor(treeState.entry()).node().traverse("a", "b")?.getDataAsString(),
    );

    await theComputable.refreshState();

    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: false,
      value: undefined,
    });

    const r2 = await pl.withWriteTx(
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
    await tp.setTimeout(10);

    await theComputable.refreshState();

    expect(theComputable.isChanged()).toBe(true);
    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: false,
      value: undefined,
    });

    await pl.withWriteTx(
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
    await tp.setTimeout(10);

    await theComputable.refreshState();

    expect(theComputable.isChanged()).toBe(true);
    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: true,
      value: "hi!",
    });

    await pl.withWriteTx(
      "CreatingStructure3",
      async (tx) => {
        tx.lock(r1);
        tx.lock(r2);
        await tx.commit();
      },
      { sync: true },
    );
    await tp.setTimeout(10);

    await theComputable.refreshState();

    expect(theComputable.isChanged()).toBe(true);
    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: true,
      value: "hi!",
    });

    await treeState.awaitSyncLoopTermination();
  });
});

test("synchronized tree test with KV", async () => {
  await TestHelpers.withTempRoot(async (pl) => {
    const r1 = await pl.withWriteTx(
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

    const treeState = await SynchronizedTreeState.init(
      pl,
      r1,
      {
        stopPollingDelay: 10,
        pollingInterval: 10,
        logStat: "cumulative",
      },
      new ConsoleLoggerAdapter(require("console")),
    );

    const theComputable = Computable.make((c) =>
      c.accessor(treeState.entry()).node().traverse("a")?.getKeyValueAsString("b", true),
    );

    await theComputable.refreshState();

    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: false,
      value: undefined,
    });

    const r2 = await pl.withWriteTx(
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
    await tp.setTimeout(10);

    await theComputable.refreshState();

    expect(theComputable.isChanged()).toBe(true);
    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: false,
      value: undefined,
    });

    await pl.withWriteTx("AssignKeyValue", async (tx) => {
      tx.setKValue(r2, "b", "hi!");
      await tx.commit();
    });
    await tp.setTimeout(10);

    await theComputable.refreshState();

    expect(theComputable.isChanged()).toBe(true);
    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: true,
      value: "hi!",
    });

    await treeState.awaitSyncLoopTermination();
  });
});

test("termination test", async () => {
  await TestHelpers.withTempRoot(async (pl) => {
    const r1 = await pl.withWriteTx(
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
    await tp.setTimeout(10);

    const treeState = await SynchronizedTreeState.init(
      pl,
      r1,
      {
        stopPollingDelay: 10,
        pollingInterval: 10,
        logStat: "cumulative",
      },
      new ConsoleLoggerAdapter(require("console")),
    );

    const entry = treeState.entry();
    const theComputable = Computable.make((c) =>
      c.accessor(entry).node().traverse("a")?.getKeyValueAsString("b", true),
    );

    await theComputable.refreshState();

    expect(await theComputable.getValueOrError()).toMatchObject({
      stable: false,
      value: undefined,
    });

    await treeState.terminate();

    const resultAfterTermination = await theComputable.getValueOrError();
    expect(resultAfterTermination).toMatchObject({
      type: "error",
    });
    expect((resultAfterTermination as any).errors[0].message).toMatch("terminated");
  });
});

/** A fresh resource (a test struct, or a unique json/object value per `make`) hung under the
 * client root; removing that field makes the backend collect it. */
async function createRootUnderClientRoot(
  pl: PlClient,
  fieldName: string,
  make: "struct" | "jsonValue" = "struct",
): Promise<SignedResourceId> {
  return await pl.withWriteTx(
    "CreatingRoot",
    async (tx) => {
      const r =
        make === "struct"
          ? tx.createStruct(TestStructuralResourceType1)
          : tx.createValue(
              { name: "json/object", version: "1" },
              // unique content: Values are deduplicated by content
              Buffer.from(JSON.stringify({ nonce: `${Date.now()}-${Math.random()}` })),
            );
      const f = field(tx.clientRoot, fieldName);
      tx.createField(f, "Dynamic");
      tx.setField(f, r);
      await tx.commit();
      return await r.globalId;
    },
    { sync: true },
  );
}

async function deleteAndAwaitGone(pl: PlClient, fieldName: string, rid: SignedResourceId) {
  await pl.withWriteTx(
    "DeletingRoot",
    async (tx) => {
      tx.removeField(field(tx.clientRoot, fieldName));
      await tx.commit();
    },
    { sync: true },
  );
  // the backend collects the now-unreferenced resource asynchronously
  for (let i = 0; i < 100; i++) {
    const gone = await pl.withReadTx(
      "CheckingRoot",
      async (tx) => (await tx.getResourceDataIfExists(rid, false)) === undefined,
    );
    if (gone) return;
    await tp.setTimeout(100);
  }
  throw new Error("root was not deleted by the backend");
}

test("B7: a deleted root leaves the tree and its readers see it gone", async () => {
  await TestHelpers.withTempRoot(async (pl) => {
    const root = await createRootUnderClientRoot(pl, "b7Root");
    const tree = await SynchronizedTreeState.init(pl, root, {
      stopPollingDelay: 50,
      pollingInterval: 10,
    });
    try {
      const reader = Computable.make((c) => c.accessor(tree.entry()).node().resourceType.name);
      expect(await reader.getValue()).toBe(TestStructuralResourceType1.name);

      const generation = tree.changeGeneration;
      await deleteAndAwaitGone(pl, "b7Root", root);
      await tree.refreshState();

      expect(tree.dumpState().some((r) => r.id === root)).toBe(false);
      // the tree moved, so a holder persisting it on change writes the emptied mirror
      expect(tree.changeGeneration).toBeGreaterThan(generation);
      expect(reader.isChanged()).toBe(true);
      await expect(reader.getValue()).rejects.toThrow(/not found/);

      // and the tree keeps polling without error
      await tree.refreshState();
    } finally {
      await tree.terminate();
    }
  });
}, 60_000);

test("B7: rootsNeverFinal checks a root the predicate calls final", async () => {
  await TestHelpers.withTempRoot(async (pl) => {
    // json/object is always final in the default predicate
    const root = await createRootUnderClientRoot(pl, "b7FinalRoot", "jsonValue");
    const tree = await SynchronizedTreeState.init(pl, root, {
      stopPollingDelay: 50,
      pollingInterval: 10,
      rootsNeverFinal: true,
    });
    try {
      const isFinal = Computable.make((c) => c.accessor(tree.entry()).node().getIsFinal());
      expect(await isFinal.getValue()).toBe(false);

      await deleteAndAwaitGone(pl, "b7FinalRoot", root);
      await tree.refreshState();
      expect(tree.dumpState().some((r) => r.id === root)).toBe(false);
    } finally {
      await tree.terminate();
    }
  });
}, 60_000);

test("B3: a persistent update error rebuilds with backoff, and the backoff resets", async () => {
  await TestHelpers.withTempRoot(async (pl) => {
    const root = await createRootUnderClientRoot(pl, "b3Root");

    // Throws on every resource while `failing`, so every rebuild's full read fails the same way.
    let failing = false;
    const failures: number[] = [];
    const predicate: FinalResourceDataPredicate = (r) => {
      if (failing) {
        failures.push(Date.now());
        throw new Error("predicate failure");
      }
      return DefaultFinalResourceDataPredicate(r);
    };
    const tree = await SynchronizedTreeState.init(pl, root, {
      stopPollingDelay: 60_000,
      pollingInterval: 10,
      finalPredicateOverride: predicate,
    });
    const touch = async (value: string) =>
      await pl.withWriteTx(
        "Touch",
        async (tx) => {
          tx.setKValue(root, "k", Buffer.from(value));
          await tx.commit();
        },
        { sync: true },
      );
    try {
      await tree.refreshState();

      failing = true;
      await touch("1");
      await tree.refreshState().catch(() => {});
      await tp.setTimeout(1500);
      // ~100, 200, 400, 800 ms apart (±20% jitter): about 5 reads in 1.5 s, 6 allowed for
      // timing slack. Without the wait the loop re-reads at the speed of the link.
      const persistent = failures.length;
      expect(persistent).toBeGreaterThanOrEqual(2);
      expect(persistent).toBeLessThanOrEqual(6);

      // recovers once the error goes away
      failing = false;
      await tree.refreshState();
      expect(tree.dumpState().some((r) => r.id === root)).toBe(true);

      // and a new error starts from the initial delay again, not from where the last one left
      const start = failures.length;
      failing = true;
      await touch("2");
      await tree.refreshState().catch(() => {});
      await tp.setTimeout(500);
      expect(failures.length - start).toBeGreaterThanOrEqual(2);
      failing = false;
    } finally {
      await tree.terminate();
    }
  });
}, 60_000);

test("B11: an MTW field deleted and recreated as Input between polls is applied", async () => {
  await TestHelpers.withTempRoot(async (pl) => {
    const root = await pl.withWriteTx(
      "B11Seed",
      async (tx) => {
        const r = tx.createStruct(TestStructuralResourceType1);
        const rf = field(tx.clientRoot, "b11Root");
        tx.createField(rf, "Dynamic");
        tx.setField(rf, r);
        tx.createField(field(r, "g"), "MTW");
        await tx.commit();
        return await r.globalId;
      },
      { sync: true },
    );
    const tree = await SynchronizedTreeState.init(pl, root, {
      stopPollingDelay: 50,
      pollingInterval: 10,
    });
    try {
      const inputs = Computable.make((c) => c.accessor(tree.entry()).node().listInputFields());
      expect(await inputs.getValue()).toEqual([]);

      await pl.withWriteTx(
        "B11Recreate",
        async (tx) => {
          tx.removeField(field(root, "g"));
          tx.createField(field(root, "g"), "Input");
          await tx.commit();
        },
        { sync: true },
      );
      await tree.refreshState();

      const g = tree
        .dumpState()
        .find((r) => r.id === root)
        ?.fields.find((f) => f.name === "g");
      expect(g?.type).toBe("Input");
      expect(inputs.isChanged()).toBe(true);
      expect(await inputs.getValue()).toEqual(["g"]);
    } finally {
      await tree.terminate();
    }
  });
}, 60_000);

async function touch(pl: PlClient, rid: SignedResourceId) {
  await pl.withWriteTx(
    "Touch",
    async (tx) => {
      tx.setKValue(rid, "touched", Buffer.from(`${Date.now()}-${Math.random()}`));
      await tx.commit();
    },
    { sync: true },
  );
}

async function removeClientRootField(pl: PlClient, fieldName: string) {
  await pl.withWriteTx(
    "Removing",
    async (tx) => {
      tx.removeField(field(tx.clientRoot, fieldName));
      await tx.commit();
    },
    { sync: true },
  );
}

async function awaitGone(pl: PlClient, rid: SignedResourceId) {
  for (let i = 0; i < 100; i++) {
    const gone = await pl.withReadTx(
      "Checking",
      async (tx) => (await tx.getResourceDataIfExists(rid, false)) === undefined,
    );
    if (gone) return;
    await tp.setTimeout(100);
  }
  throw new Error("resource was not deleted by the backend");
}

const traversalModes: TraversalMode[] = ["backend-delta", "backend-streaming", "client-bfs"];
for (const mode of traversalModes)
  test(`B7: a deleted root is dropped under ${mode}`, async () => {
    // under every loading algorithm a walk seeded at a deleted resource yields nothing and no
    // error, so only the existence check can notice the root is gone
    await TestHelpers.withTempRoot(async (pl) => {
      const name = `b7Mode_${mode}`;
      const root = await createRootUnderClientRoot(pl, name);
      const tree = await SynchronizedTreeState.init(pl, root, {
        stopPollingDelay: 50,
        pollingInterval: 10,
        traversalMode: mode,
      });
      try {
        await removeClientRootField(pl, name);
        await awaitGone(pl, root);
        await tree.refreshState();
        expect(tree.dumpState().some((r) => r.id === root)).toBe(false);
        await tree.refreshState();
      } finally {
        await tree.terminate();
      }
    });
  }, 60_000);

for (const holderFirst of [false, true])
  test(`B7: a deleted root held by another deleted root leaves in the same poll (${holderFirst ? "holder" : "held"} first)`, async () => {
    await TestHelpers.withTempRoot(async (pl) => {
      const { a, b } = await pl.withWriteTx(
        "Chain",
        async (tx) => {
          const ra = tx.createStruct(TestStructuralResourceType1);
          const rb = tx.createStruct(TestStructuralResourceType1);
          const f = field(tx.clientRoot, "b7Chain");
          tx.createField(f, "Dynamic");
          tx.setField(f, ra);
          tx.createField(field(ra, "child"), "Dynamic");
          tx.setField(field(ra, "child"), rb);
          await tx.commit();
          return { a: await ra.globalId, b: await rb.globalId };
        },
        { sync: true },
      );
      const roots = [a, b].map((root) => ({ kind: "resource" as const, root }));
      const tree = await SynchronizedTreeState.init(pl, holderFirst ? roots : roots.reverse(), {
        stopPollingDelay: 50,
        pollingInterval: 10,
      });
      try {
        await removeClientRootField(pl, "b7Chain");
        await awaitGone(pl, a);
        await awaitGone(pl, b);
        await tree.refreshState();
        const ids = tree.dumpState().map((r) => r.id);
        expect(ids).not.toContain(a);
        expect(ids).not.toContain(b);
      } finally {
        await tree.terminate();
      }
    });
  }, 60_000);

for (const rebuiltFirst of [true, false])
  test(`B3: a plain error ${rebuiltFirst ? "after a rebuild" : "with no rebuild before it"} is retried at the polling interval`, async () => {
    await TestHelpers.withTempRoot(async (pl) => {
      const root = await createRootUnderClientRoot(pl, "b3Plain");
      // with rebuiltFirst, one predicate throw forces a rebuild first; in both variants the
      // pruning function then throws a plain Error (outside the update, so not a
      // TreeStateUpdateError) on every poll
      let predicateThrowsOnce = false;
      let pruneFailing = false;
      const pruneFailures: number[] = [];
      const predicate: FinalResourceDataPredicate = (r) => {
        if (predicateThrowsOnce) {
          predicateThrowsOnce = false;
          pruneFailing = true;
          throw new Error("one-off predicate failure");
        }
        return DefaultFinalResourceDataPredicate(r);
      };
      const pruning = (r: ExtendedResourceData): FieldData[] => {
        if (pruneFailing) {
          pruneFailures.push(Date.now());
          throw new Error("walk failure");
        }
        return r.fields;
      };
      const tree = await SynchronizedTreeState.init(pl, root, {
        stopPollingDelay: 60_000,
        pollingInterval: 1000,
        finalPredicateOverride: predicate,
        pruning,
      });
      try {
        await tree.refreshState();
        if (rebuiltFirst) predicateThrowsOnce = true;
        else pruneFailing = true;
        await touch(pl, root);
        await tree.refreshState().catch(() => {});
        const start = pruneFailures.length;
        await tp.setTimeout(2000);
        // one attempt per polling interval, give or take one
        expect(new Set(pruneFailures.slice(start)).size).toBeLessThanOrEqual(3);
      } finally {
        pruneFailing = false;
        await tree.terminate();
      }
    });
  }, 60_000);

test("a rebuild re-runs a reader waiting for a resource the tree had not loaded", async () => {
  await TestHelpers.withTempRoot(async (pl) => {
    const root = await createRootUnderClientRoot(pl, "rebuildRoot");
    const c = await createRootUnderClientRoot(pl, "rebuildC");
    let throwOnce = false;
    const predicate: FinalResourceDataPredicate = (r) => {
      if (throwOnce) {
        throwOnce = false;
        throw new Error("one-off predicate failure");
      }
      return DefaultFinalResourceDataPredicate(r);
    };
    const tree = await SynchronizedTreeState.init(pl, root, {
      stopPollingDelay: 60_000,
      pollingInterval: 10,
      finalPredicateOverride: predicate,
    });
    try {
      const reader = Computable.make((ctx) => ctx.accessor(tree.entry(c)).node().resourceType.name);
      await expect(reader.getValue()).rejects.toThrow(/not found/);

      throwOnce = true;
      await touch(pl, root);
      await tree.refreshState().catch(() => {});
      expect(throwOnce).toBe(false);

      await pl.withWriteTx(
        "Attaching",
        async (tx) => {
          tx.createField(field(root, "c"), "Dynamic");
          tx.setField(field(root, "c"), c);
          await tx.commit();
        },
        { sync: true },
      );
      await tree.refreshState();
      await tree.refreshState();
      expect(reader.isChanged()).toBe(true);
      expect(await reader.getValue()).toBe(TestStructuralResourceType1.name);
    } finally {
      await tree.terminate();
    }
  });
}, 60_000);

test("terminate rejects a refresh still waiting for its poll", async () => {
  await TestHelpers.withTempRoot(async (pl) => {
    const root = await createRootUnderClientRoot(pl, "terminateRoot");
    let failing = false;
    const predicate: FinalResourceDataPredicate = (r) => {
      if (failing) throw new Error("predicate failure");
      return DefaultFinalResourceDataPredicate(r);
    };
    const tree = await SynchronizedTreeState.init(pl, root, {
      stopPollingDelay: 60_000,
      pollingInterval: 10,
      finalPredicateOverride: predicate,
    });
    await tree.refreshState();
    failing = true;
    await touch(pl, root);
    await tree.refreshState().catch(() => {});
    // the loop is now inside a rebuild wait, which a refresh does not interrupt
    let outcome = "pending";
    void tree.refreshState().then(
      () => (outcome = "resolved"),
      () => (outcome = "rejected"),
    );
    await tree.terminate();
    await tp.setTimeout(10);
    expect(outcome).toBe("rejected");
  });
}, 60_000);
