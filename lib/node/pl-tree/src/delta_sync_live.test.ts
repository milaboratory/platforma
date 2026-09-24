import { test, expect } from "vitest";
import {
  asSignedResourceId,
  field,
  hasCapability,
  parseSignedResourceId,
  TestHelpers,
} from "@milaboratories/pl-client";
import type { PlClient } from "@milaboratories/pl-client";
import type { ExtendedResourceData } from "./state";
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
/** Marks the test SKIPPED, not passed, when the backend cannot serve delta.
 *
 * These previously returned early, so on a backend without the capability the whole delta
 * suite reported four green ticks over zero delta code. Skipped and passed are different
 * signals and a run summary has to be able to tell them apart. */
function skipUnlessDelta(pl: PlClient, ctx: { skip: (note?: string) => void }): boolean {
  if (hasCapability(pl.serverInfo.capabilities ?? [], "treeChangedSince:v1")) return true;
  ctx.skip("backend does not advertise treeChangedSince:v1 (needs pl PR #2163)");
  return false;
}

const logger = new ConsoleLoggerAdapter(console);

/** Whole-mirror comparison, so a retained-but-unreferenced resource or a dropped property
 * shows up rather than only a differing count. */
function canonicalShape(resources: ExtendedResourceData[]): string {
  return resources
    .map(
      (r) =>
        `${r.id}|${r.kind}|${r.final}|${r.inputsLocked}|${r.outputsLocked}|` +
        `${r.fields
          .map((f) => `${f.name}=${f.value}`)
          .sort()
          .join(",")}|kv:${r.kv
          .map((kv) => kv.key)
          .sort()
          .join(",")}`,
    )
    .sort()
    .join("\n");
}

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

async function openTree(
  pl: PlClient,
  root: string,
  traversalMode: TraversalMode,
  extra: Record<string, unknown> = {},
) {
  return await SynchronizedTreeState.init(
    pl,
    root as never,
    { stopPollingDelay: 50, pollingInterval: 10, traversalMode, ...extra } as never,
    logger,
  );
}

test("a delta poll delivers a change on a resource the mirror already holds", async (ctx) => {
  await TestHelpers.withTempRoot(async (pl) => {
    if (!skipUnlessDelta(pl, ctx)) return;

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

test("delta and streaming converge on the same mirror", async (ctx) => {
  await TestHelpers.withTempRoot(async (pl) => {
    if (!skipUnlessDelta(pl, ctx)) return;

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

test("a quiet parent: a change under an unchanged resource still arrives", async (ctx) => {
  await TestHelpers.withTempRoot(async (pl) => {
    if (!skipUnlessDelta(pl, ctx)) return;

    const { root, child } = await seedTree(pl);
    const tree = await openTree(pl, root, "backend-delta");
    try {
      await tree.refreshState();

      // A KV write on the child does not rewrite the root, so the root stays quiet. With
      // the child is its own seed, so the walk reaches it anyway. This is
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

test("a delta tree restored from a snapshot converges with streaming", async (ctx) => {
  await TestHelpers.withTempRoot(async (pl) => {
    if (!skipUnlessDelta(pl, ctx)) return;

    const { root } = await seedTree(pl);

    // Load through streaming, then hand that mirror to a delta tree via restoreFrom. This is
    // the ordinary upgrade path and the one shape a cold open cannot produce: a POPULATED
    // mirror whose first delta poll carries no token, so it is a full walk that also sends no
    // stop rules. Bodies for resources the mirror holds as final must be skipped, or the apply
    // throws; resources below them must not be retained unreferenced.
    //
    // The earlier version of this test opened a fresh delta tree after terminating the
    // streaming one, which gave an EMPTY mirror and asserted nothing.
    // The fixture must actually contain a final resource or the skip branch is never reached:
    // DefaultFinalResourceDataPredicate marks none of the test resource types final, which is
    // why an earlier version of this test passed with the skip disabled. Everything except the
    // root goes final, so the root stays a seed and the tree can still poll.
    const finalPredicateOverride = (r: { id: unknown }) => r.id !== root;

    const warm = await openTree(pl, root, "backend-streaming", { finalPredicateOverride });
    await warm.refreshState();
    const witness = parseSignedResourceId(asSignedResourceId(root)).signature;
    const snapshot = warm.capture(witness);
    const streamingShape = canonicalShape(warm.dumpState());
    await warm.terminate();

    const delta = await SynchronizedTreeState.init(
      pl,
      root as never,
      {
        stopPollingDelay: 50,
        pollingInterval: 10,
        traversalMode: "backend-delta",
        restoreFrom: snapshot,
        finalPredicateOverride,
      },
      logger,
    );
    try {
      expect(delta.wasRestoredFromSnapshot).toBe(true);
      await delta.refreshState();
      await delta.refreshState();
      expect(canonicalShape(delta.dumpState())).toBe(streamingShape);
    } finally {
      await delta.terminate();
    }
  });
}, 300_000);
