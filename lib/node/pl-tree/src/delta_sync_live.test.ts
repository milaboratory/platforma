import { test, expect } from "vitest";
import { field, hasCapability, TestHelpers } from "@milaboratories/pl-client";
import type { PlClient } from "@milaboratories/pl-client";
import { TestStructuralResourceType1 } from "./test_utils";
import { SynchronizedTreeState } from "./synchronized_tree";
import { ConsoleLoggerAdapter } from "@milaboratories/ts-helpers";
import type { TraversalMode } from "./sync";
import tp from "timers/promises";

/**
 * Delta polling against a real backend, for correctness only. Cost (bytes and round trips per
 * poll) is the benchmark's job, since stats are loop-internal with no public accessor.
 *
 * Everything here needs `treeChangedSince:v1`, which
 * only a backend built from pl PR #2163 advertises, so each test skips rather than fails on
 * one without it. The unit coverage in `delta_sync.test.ts` pins the client's own logic; what
 * cannot be faked, and is what these are for, is the backend's own emission rule.
 */
function deltaCapable(pl: PlClient, testName: string): boolean {
  const capable = hasCapability(pl.serverInfo.capabilities ?? [], "treeChangedSince:v1");
  // Returning early would report green having executed nothing, which is worse than a skip:
  // the expected state today is a backend without the capability, so a silent pass here means
  // the whole delta suite reads as covered when it never ran.
  if (!capable) console.warn(`SKIPPED (backend lacks treeChangedSince:v1): ${testName}`);
  return capable;
}

const logger = new ConsoleLoggerAdapter(console);

/** A root with one child holding data, which is enough of a tree to poll. */
async function seedTree(pl: PlClient) {
  return await pl.withWriteTx(
    "DeltaSeed",
    async (tx) => {
      const root = tx.createStruct(TestStructuralResourceType1);
      const rootField = field(tx.clientRoot, "deltaRoot");
      tx.createField(rootField, "Dynamic");
      tx.setField(rootField, root);

      const child = tx.createStruct(TestStructuralResourceType1);
      const childField = field(root, "child");
      tx.createField(childField, "Dynamic");
      tx.setField(childField, child);

      await tx.commit();
      return { root: await root.globalId, child: await child.globalId };
    },
    { sync: true },
  );
}

async function openTree(pl: PlClient, root: string, traversalMode: TraversalMode) {
  return await SynchronizedTreeState.init(
    pl,
    root as never,
    { stopPollingDelay: 50, pollingInterval: 10, traversalMode, logStat: "cumulative" },
    logger,
  );
}

test("a delta poll delivers a change on a resource the mirror already holds", async () => {
  await TestHelpers.withTempRoot(async (pl) => {
    if (!deltaCapable(pl, "delivers a change on a held resource")) return;

    const { root, child } = await seedTree(pl);
    const tree = await openTree(pl, root, "backend-delta");
    try {
      await tree.refreshState();

      // Attach a new resource under the child, so the child's own state moves.
      await pl.withWriteTx(
        "DeltaMutate",
        async (tx) => {
          const grandchild = tx.createStruct(TestStructuralResourceType1);
          const f = field(child as never, "grandchild");
          tx.createField(f, "Dynamic");
          tx.setField(f, grandchild);
          await tx.commit();
        },
        { sync: true },
      );

      await tree.refreshState();

      // The grandchild is a resource the mirror never held, referenced by a body the delta
      // did carry: exactly the case the resolution round exists for.
      const dump = tree.dumpState();
      expect(dump.some((r) => r.fields.some((f) => f.name === "grandchild"))).toBe(true);
    } finally {
      await tree.terminate();
    }
  });
});

test("delta and streaming converge on the same mirror", async () => {
  await TestHelpers.withTempRoot(async (pl) => {
    if (!deltaCapable(pl, "delta and streaming converge")) return;

    const { root, child } = await seedTree(pl);

    const delta = await openTree(pl, root, "backend-delta");
    const streaming = await openTree(pl, root, "backend-streaming");
    try {
      await Promise.all([delta.refreshState(), streaming.refreshState()]);

      await pl.withWriteTx(
        "DeltaConverge",
        async (tx) => {
          const extra = tx.createStruct(TestStructuralResourceType1);
          const f = field(child as never, "extra");
          tx.createField(f, "Dynamic");
          tx.setField(f, extra);
          await tx.commit();
        },
        { sync: true },
      );

      // Poll both twice: delta needs the second to see the change settle, and streaming is
      // idempotent, so this cannot favour either.
      await Promise.all([delta.refreshState(), streaming.refreshState()]);
      await Promise.all([delta.refreshState(), streaming.refreshState()]);

      const shape = (t: SynchronizedTreeState) =>
        t
          .dumpState()
          .map(
            (r) =>
              `${r.id}|${r.fields
                .map((f) => `${f.name}=${f.value}`)
                .sort()
                .join(",")}`,
          )
          .sort();

      expect(shape(delta)).toEqual(shape(streaming));
    } finally {
      await Promise.all([delta.terminate(), streaming.terminate()]);
    }
  });
});

test("a quiet parent: a change under an unchanged resource still arrives", async () => {
  await TestHelpers.withTempRoot(async (pl) => {
    if (!deltaCapable(pl, "quiet parent")) return;

    const { root, child } = await seedTree(pl);
    const tree = await openTree(pl, root, "backend-delta");
    try {
      await tree.refreshState();

      // A KV write on the child does not rewrite the root, so the root stays quiet. With
      // finalisation on the child is its own seed, so the walk reaches it anyway. This is
      // the assertion that justifies seeding the frontier rather than the roots.
      await pl.withWriteTx(
        "DeltaQuietParent",
        async (tx) => {
          tx.setKValue(child as never, "quiet", Buffer.from("value"));
          await tx.commit();
        },
        { sync: true },
      );

      // Give the poll loop a couple of cycles: the change has to be reached, not just sent.
      for (let i = 0; i < 3; i++) {
        await tree.refreshState();
        await tp.setTimeout(20);
      }

      const dump = tree.dumpState();
      const childState = dump.find((r) => r.id === child);
      expect(childState?.kv.some((kv) => kv.key === "quiet")).toBe(true);
    } finally {
      await tree.terminate();
    }
  });
});

test("a token-less poll over a populated mirror does not throw", async () => {
  await TestHelpers.withTempRoot(async (pl) => {
    if (!deltaCapable(pl, "token-less poll over a populated mirror")) return;

    const { root } = await seedTree(pl);

    // Load once through streaming so the mirror is populated and some resources may have
    // gone final, then hand that same state to a delta tree whose token is still unset. That
    // is the shape of a warm start from a snapshot, and of the first poll after a token
    // discard: a full walk that delivers bodies for resources the mirror already holds as
    // final, which updateFromResourceData refuses.
    const warm = await openTree(pl, root, "backend-streaming");
    await warm.refreshState();
    const streamingShape = warm.dumpState().length;
    await warm.terminate();

    const delta = await openTree(pl, root, "backend-delta");
    try {
      await delta.refreshState();
      await delta.refreshState();
      expect(delta.dumpState().length).toBe(streamingShape);
    } finally {
      await delta.terminate();
    }
  });
});
