import { test, expect } from "vitest";
import { field, hasCapability, TestHelpers } from "@milaboratories/pl-client";
import type { PlClient, PlTransaction, SignedResourceId } from "@milaboratories/pl-client";
import { TestStructuralResourceType1 } from "./test_utils";
import { SynchronizedTreeState } from "./synchronized_tree";
import type { ExtendedResourceData } from "./state";
import type { TraversalMode } from "./sync";
import { ConsoleLoggerAdapter } from "@milaboratories/ts-helpers";

/**
 * Differential test: every loading algorithm must arrive at the same mirror, after every step
 * of a sequence of mutations, not just at the end.
 *
 * This is the backwards-compatibility guard for making delta the default. `client-bfs` and
 * `backend-streaming` are the algorithms that shipped; `backend-delta` is the new one, and it
 * reaches the tree by a completely different route - it is told what changed rather than
 * walking to find out. Nothing but a full-state comparison catches an update it fails to
 * deliver, because a missed change looks exactly like a change that has not happened yet.
 *
 * SCOPE, and why it is what it is: no `pruning`, `fieldFilter` or `traverseStopRules` are
 * configured. Those legitimately make the mirrors differ - streaming sends stop rules to the
 * backend where delta cannot, and BFS declines to traverse a pruned field where the backend
 * paths prune after the frames arrive. Equivalence is claimed for an unshaped tree only.
 */

const logger = new ConsoleLoggerAdapter(console);

/** Every comparable byte of the mirror, canonically ordered. Ids, field pointers, KV, data,
 * and every flag - a comparison that skipped any of these would pass while an algorithm
 * silently dropped that part of an update. */
function canonical(resources: ExtendedResourceData[]): string {
  return resources
    .map((r) =>
      [
        r.id,
        r.type.name + "@" + r.type.version,
        r.kind,
        `data=${r.data === undefined ? "-" : Buffer.from(r.data).toString("hex")}`,
        `err=${r.error}`,
        `orig=${r.originalResourceId}`,
        `ready=${r.resourceReady}`,
        `in=${r.inputsLocked}`,
        `out=${r.outputsLocked}`,
        `final=${r.final}`,
        "fields=" +
          [...r.fields]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((f) => `${f.name}:${f.type}:${f.status}:${f.value}:${f.error}:${f.valueIsFinal}`)
            .join(","),
        "kv=" +
          [...r.kv]
            .sort((a, b) => a.key.localeCompare(b.key))
            .map((kv) => `${kv.key}=${Buffer.from(kv.value).toString("hex")}`)
            .join(","),
      ].join("|"),
    )
    .sort()
    .join("\n");
}

async function openTree(pl: PlClient, root: SignedResourceId, traversalMode: TraversalMode) {
  return await SynchronizedTreeState.init(
    pl,
    root,
    { stopPollingDelay: 50, pollingInterval: 10, traversalMode },
    logger,
  );
}

/** Polls until the mirror stops changing, so a slower algorithm is given the chance to catch
 * up rather than being failed for latency. A real divergence survives this. */
async function settle(tree: SynchronizedTreeState): Promise<string> {
  let last = "";
  for (let i = 0; i < 8; i++) {
    await tree.refreshState();
    const now = canonical(tree.dumpState());
    if (now === last && i > 0) return now;
    last = now;
  }
  return last;
}

test("every algorithm converges on the same mirror at every step", async () => {
  await TestHelpers.withTempRoot(async (pl) => {
    const caps = pl.serverInfo.capabilities ?? [];
    const modes: TraversalMode[] = ["client-bfs", "backend-streaming"];
    if (hasCapability(caps, "treeChangedSince:v1")) modes.push("backend-delta");
    else console.warn("SKIPPING backend-delta: backend lacks treeChangedSince:v1");

    // A root with two children, deep enough that a change can hide under an unchanged parent.
    const seed = await pl.withWriteTx(
      "EquivSeed",
      async (tx) => {
        const root = tx.createStruct(TestStructuralResourceType1);
        const rf = field(tx.clientRoot, "equivRoot");
        tx.createField(rf, "Dynamic");
        tx.setField(rf, root);

        const a = tx.createStruct(TestStructuralResourceType1, Buffer.from("a-data"));
        const af = field(root, "a");
        tx.createField(af, "Dynamic");
        tx.setField(af, a);

        const b = tx.createStruct(TestStructuralResourceType1);
        const bf = field(a, "b");
        tx.createField(bf, "Dynamic");
        tx.setField(bf, b);

        // Attached under the client root, NOT under our tree root: it exists and ages
        // without this tree ever seeing it. Attaching it later is the only mutation that
        // makes a delta poll reference a resource older than its own token.
        const stranger = tx.createStruct(TestStructuralResourceType1, Buffer.from("old-data"));
        const sf = field(tx.clientRoot, "equivStranger");
        tx.createField(sf, "Dynamic");
        tx.setField(sf, stranger);

        await tx.commit();
        return {
          root: await root.globalId,
          a: await a.globalId,
          b: await b.globalId,
          stranger: await stranger.globalId,
        };
      },
      { sync: true },
    );

    const trees = new Map<TraversalMode, SynchronizedTreeState>();
    for (const m of modes) trees.set(m, await openTree(pl, seed.root, m));

    /** Each step mutates the tree, then every algorithm must agree on the result. */
    const steps: [string, (tx: PlTransaction) => void][] = [
      // A KV write deep in the tree: b's own state moves while root and a stay quiet, which
      // is the case a root-seeded delta walk cannot reach.
      ["kv on a leaf", (tx) => tx.setKValue(seed.b, "k1", Buffer.from("v1"))],
      ["kv overwrite", (tx) => tx.setKValue(seed.b, "k1", Buffer.from("v2"))],
      ["second kv", (tx) => tx.setKValue(seed.b, "k2", Buffer.from("v3"))],
      // A new resource attached under a held one: the referrer changes and points at
      // something no mirror has seen, which is what delta's resolution round exists for.
      [
        "new resource under a leaf",
        (tx) => {
          const c = tx.createStruct(TestStructuralResourceType1, Buffer.from("c-data"));
          const cf = field(seed.b, "c");
          tx.createField(cf, "Dynamic");
          tx.setField(cf, c);
        },
      ],
      // The case that forces a resolution round: a field repointed at a resource that is
      // OLDER than the poll's token, so the delta walk will not carry it and the client has
      // to read it back explicitly. A brand-new resource does not test this - new means
      // changed, so the walk delivers it anyway.
      [
        "attach a pre-existing resource the mirror never held",
        (tx) => {
          const sf = field(seed.b, "stranger");
          tx.createField(sf, "Dynamic");
          tx.setField(sf, seed.stranger);
        },
      ],
      // Locking changes flags without touching data or fields.
      ["lock inputs on a leaf", (tx) => tx.lockInputs(seed.b)],
      ["lock outputs on a leaf", (tx) => tx.lockOutputs(seed.b)],
      // A field removal drives the refcount GC cascade, which is the one change that does not
      // set the changed flag in updateFromResourceData.
      ["remove a field", (tx) => tx.removeField(field(seed.a, "b"))],
    ];

    try {
      const first = new Map<TraversalMode, string>();
      for (const m of modes) first.set(m, await settle(trees.get(m)!));
      for (const m of modes.slice(1))
        expect(first.get(m), `initial load: ${m} vs ${modes[0]}`).toBe(first.get(modes[0]!));

      for (const [label, mutate] of steps) {
        await pl.withWriteTx(
          "EquivStep",
          async (tx) => {
            mutate(tx);
            await tx.commit();
          },
          { sync: true },
        );

        const shapes = new Map<TraversalMode, string>();
        for (const m of modes) shapes.set(m, await settle(trees.get(m)!));

        const reference = shapes.get(modes[0]!)!;
        for (const m of modes.slice(1)) {
          expect(shapes.get(m), `after "${label}": ${m} diverged from ${modes[0]}`).toBe(reference);
        }
      }
    } finally {
      for (const t of trees.values()) await t.terminate();
    }
  });
}, 300_000);
