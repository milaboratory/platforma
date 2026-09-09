import { test } from "vitest";
import { field, hasCapability, TestHelpers } from "@milaboratories/pl-client";
import type { PlClient, PlTransaction, SignedResourceId } from "@milaboratories/pl-client";
import { DefaultFinalResourceDataPredicate } from "@milaboratories/pl-client";
import { TestStructuralResourceType1 } from "./test_utils";
import { PlTreeState } from "./state";
import { constructTreeLoadingRequest, initialTreeLoadingStat, loadTreeState } from "./sync";
import type { TraversalMode, TreeLoadingStat } from "./sync";
import type { FieldData } from "@milaboratories/pl-client";
import type { ExtendedResourceData } from "./state";

/**
 * Cost comparison across the tree loading algorithms, and finalisation on vs off.
 *
 * Asserts nothing, and no-ops without `PL_TREE_BENCH=1`. Drives `loadTreeState` directly so
 * each poll is one deliberate round and the stat object is visible, neither of which is true
 * through `SynchronizedTreeState`.
 *
 *   PL_TREE_BENCH=1 pnpm exec vitest run src/delta_benchmark.test.ts
 *
 * Delta arms report as skipped on a backend without `treeChangedSince:v1`, rather than
 * silently measuring the fallback.
 */

/** Without a payload every struct is empty and the downlink-bytes column - the whole point of
 * delta - reads as zero on every arm. */
const PAYLOAD = Buffer.alloc(2048, "x");

/** Modest on purpose: the shape of the numbers shows up well before a 7k-resource project.
 * Note the seed count scales with the mirror, so this is too small to price that. */
const CHILDREN = 12;
const GRANDCHILDREN = 6;
/** Polls per arm after the initial load. */
const POLL_CYCLES = 3;

type Arm = { label: string; mode: TraversalMode; pruning: boolean };

const ARMS: Arm[] = [
  { label: "client-bfs        prune=on ", mode: "client-bfs", pruning: true },
  { label: "client-bfs        prune=off", mode: "client-bfs", pruning: false },
  { label: "backend-streaming prune=on ", mode: "backend-streaming", pruning: true },
  { label: "backend-streaming prune=off", mode: "backend-streaming", pruning: false },
  { label: "backend-delta     prune=on ", mode: "backend-delta", pruning: true },
  { label: "backend-delta     prune=off", mode: "backend-delta", pruning: false },
];

/** Stands in for the real project pruning, without importing the middle layer. */
const benchPruning = (r: ExtendedResourceData): FieldData[] =>
  r.fields.filter((f) => !f.name.startsWith("pruneMe"));

async function seedTree(
  pl: PlClient,
): Promise<{ root: SignedResourceId; leaves: SignedResourceId[] }> {
  return await pl.withWriteTx(
    "BenchSeed",
    async (tx) => {
      const root = tx.createStruct(TestStructuralResourceType1, PAYLOAD);
      const rootField = field(tx.clientRoot, "benchRoot");
      tx.createField(rootField, "Dynamic");
      tx.setField(rootField, root);

      const leaves: Promise<SignedResourceId>[] = [];
      for (let c = 0; c < CHILDREN; c++) {
        const child = tx.createStruct(TestStructuralResourceType1, PAYLOAD);
        const cf = field(root, `child${c}`);
        tx.createField(cf, "Dynamic");
        tx.setField(cf, child);

        // A field the pruning function removes, so prune=on and prune=off differ.
        const pruned = tx.createStruct(TestStructuralResourceType1, PAYLOAD);
        const pf = field(child, "pruneMe");
        tx.createField(pf, "Dynamic");
        tx.setField(pf, pruned);

        for (let g = 0; g < GRANDCHILDREN; g++) {
          const grand = tx.createStruct(TestStructuralResourceType1, PAYLOAD);
          const gf = field(child, `g${g}`);
          tx.createField(gf, "Dynamic");
          tx.setField(gf, grand);
          leaves.push(grand.globalId);
        }
      }

      await tx.commit();
      return { root: await root.globalId, leaves: await Promise.all(leaves) };
    },
    { sync: true },
  );
}

/** One mutation between polls: a KV write on a leaf. The parent is not rewritten, so this is
 * the quiet-parent shape - which is exactly what the finalisation arms differ on. */
async function touchLeaf(pl: PlClient, leaf: SignedResourceId, arm: string, round: number) {
  await pl.withWriteTx(
    "BenchTouch",
    async (tx: PlTransaction) => {
      // Keyed by arm: the tree is shared and never reset, and state.ts compares KV values,
      // so a later arm rewriting the same key with the same bytes observes no change at all.
      tx.setKValue(leaf, `bench-${arm}-${round}`, Buffer.from(`r${round}`));
      await tx.commit();
    },
    { sync: true },
  );
}

type Row = {
  arm: string;
  roundTrips: number;
  resources: number;
  bytes: number;
  seeds: number;
  resolutions: number;
  unchanged: number;
  wastedBytes: number;
  /** Steady-state only: the cold load's `resourcesNew` would dwarf it and hide a lost
   * update inside a sum of ~100. */
  changedSteady: number;
  prunedFields: number;
  ms: number;
};

async function runArm(
  pl: PlClient,
  arm: Arm,
  seed: { root: SignedResourceId; leaves: SignedResourceId[] },
): Promise<Row | undefined> {
  const caps = pl.serverInfo.capabilities ?? [];
  if (arm.mode === "backend-delta" && !hasCapability(caps, "treeChangedSince:v1")) return undefined;

  // Scalar, not an array: the constructor takes SignedResourceId | Set<SignedResourceId>.
  const state = new PlTreeState(seed.root, DefaultFinalResourceDataPredicate);
  const stat: TreeLoadingStat = initialTreeLoadingStat();
  let token: Uint8Array | undefined;
  let changedAtColdLoad = 0;

  // Cold load plus POLL_CYCLES polls, one mutation before each. The cold load is included on
  // purpose: it is where the arms are meant to look alike.
  for (let cycle = 0; cycle <= POLL_CYCLES; cycle++) {
    if (cycle > 0) {
      const leaf = seed.leaves[cycle % seed.leaves.length];
      if (leaf !== undefined)
        await touchLeaf(pl, leaf, arm.label.trim().replace(/\s+/g, "-"), cycle);
    }

    const request = constructTreeLoadingRequest(state, {
      pruningFunction: arm.pruning ? benchPruning : undefined,
      changedSinceToken: token,
    });
    if (request.seedResources.length === 0 && request.finalResources.size === 0) continue;

    const { data, next } = await pl.withReadTx("BenchRead", async (tx) => {
      const next = arm.mode === "backend-delta" ? await tx.getNextSinceToken() : undefined;
      const data = await loadTreeState(tx, request, stat, caps, arm.mode);
      return { data, next };
    });

    state.updateFromResourceData(data, { allowOrphanInputs: true, stat });
    if (next !== undefined) token = next;

    // Freeze the cold-load contribution so the steady-state figure below is only the polls.
    if (cycle === 0) changedAtColdLoad = stat.resourcesNew + stat.resourcesChanged;
  }

  return {
    arm: arm.label,
    roundTrips: stat.roundTrips,
    resources: stat.retrievedResources,
    bytes: stat.retrievedResourceDataBytes + stat.retrievedKeyValueBytes,
    seeds: stat.deltaSeedsSent,
    resolutions: stat.deltaResolutionRounds,
    unchanged: stat.resourcesUnchanged,
    wastedBytes: stat.bytesUnchanged,
    changedSteady: stat.resourcesNew + stat.resourcesChanged - changedAtColdLoad,
    prunedFields: stat.prunedFields,
    ms: stat.millisSpent,
  };
}

function report(rows: Row[], skipped: string[], failed: string[] = []) {
  const pad = (s: string | number, n: number) => String(s).padStart(n);
  const lines = [
    "",
    "=== tree loading cost ===",
    `tree: ${CHILDREN} children x ${GRANDCHILDREN} grandchildren, ${POLL_CYCLES} polls after load,`,
    `      one KV write on a leaf between polls (quiet-parent shape)`,
    "",
    `${"arm".padEnd(28)} ${pad("trips", 6)} ${pad("res", 6)} ${pad("bytes", 8)} ${pad("seeds", 6)} ${pad("resolv", 7)} ${pad("unchgd", 7)} ${pad("wasted", 8)} ${pad("chgd", 5)} ${pad("pruned", 7)} ${pad("ms", 7)}`,
  ];
  for (const r of rows) {
    lines.push(
      `${r.arm.padEnd(28)} ${pad(r.roundTrips, 6)} ${pad(r.resources, 6)} ${pad(r.bytes, 8)} ${pad(r.seeds, 6)} ${pad(r.resolutions, 7)} ${pad(r.unchanged, 7)} ${pad(r.wastedBytes, 8)} ${pad(r.changedSteady, 5)} ${pad(r.prunedFields, 7)} ${pad(r.ms, 7)}`,
    );
  }

  // The correctness guard, and it has to be the change COUNT. Each arm makes exactly
  // POLL_CYCLES mutations, so each must observe that many changes; fewer means an update was
  // lost, not that work was saved. Mirror CONTENTS cannot be compared across arms, since
  // per-arm keys on a shared tree leave later arms legitimately holding more KV.
  lines.push("");
  for (const r of rows) {
    if (r.changedSteady === POLL_CYCLES) continue;
    lines.push(
      `LOST UPDATES: ${r.arm.trim()} saw ${r.changedSteady} of ${POLL_CYCLES} steady changes`,
    );
  }
  if (rows.every((r) => r.changedSteady === POLL_CYCLES)) {
    lines.push(`change check: every arm observed all ${POLL_CYCLES} steady-state changes`);
  }

  if (skipped.length > 0) {
    lines.push("", `skipped (backend lacks treeChangedSince:v1): ${skipped.join(", ")}`);
  }
  if (failed.length > 0) {
    lines.push("", "FAILED ARMS:");
    for (const f of failed) lines.push(`  ${f}`);
  }

  lines.push(
    "",
    "  res/bytes  what the arm actually pulled down; lower is the win",
    "  unchgd     resources re-fetched only to be found unchanged. Delta drives this down but",
    "             not to 0: a resolution round fetches unconditionally, so an unchanged",
    "             resolved resource legitimately lands here",
    "  wasted     bytes in that unchanged bucket",
    "  chgd       steady-state changes only, cold load excluded. Compare across arms: fewer",
    "             means an update was lost, not that work was saved",
    "  pruned     fields dropped client-side. Backend arms prune after the frames arrive, so",
    "             their trips/res/bytes do NOT differ between prune=on and prune=off; only the",
    "             BFS arms avoid traversing a pruned field",
    "  seeds      seed ids sent, summed over rounds; scales",
    "             with the mirror, so this tree is too small to show the real uplink cost",
    "",
  );
  console.log(lines.join("\n"));
}

test("benchmark: tree loading cost by algorithm", async () => {
  if (process.env.PL_TREE_BENCH !== "1") return;

  await TestHelpers.withTempRoot(async (pl) => {
    const seed = await seedTree(pl);
    const rows: Row[] = [];
    const skipped: string[] = [];

    const failed: string[] = [];
    for (const arm of ARMS) {
      // One arm failing must not lose the other five: this runs against a real backend, and
      // an algorithm that errors is itself a result worth reporting.
      try {
        const row = await runArm(pl, arm, seed);
        if (row === undefined) skipped.push(arm.label.trim());
        else rows.push(row);
      } catch (e: unknown) {
        failed.push(`${arm.label.trim()}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    report(rows, skipped, failed);
  });
}, 600_000);
