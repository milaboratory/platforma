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
 * Cost comparison between the tree loading algorithms, and between finalisation on and off.
 *
 * Not a test: it asserts nothing and is skipped unless `PL_TREE_BENCH=1`, because it needs a
 * live backend and takes real time. It drives `loadTreeState` directly rather than through
 * `SynchronizedTreeState` so each poll is one deliberate round rather than whatever the poll
 * loop decided, and so the stat object is visible.
 *
 *   PL_TREE_BENCH=1 pnpm exec vitest run src/delta_benchmark.test.ts
 *   PL_TREE_BENCH=1 PL_TREE_NO_FINALISATION=1 pnpm exec vitest run src/delta_benchmark.test.ts
 *
 * The second run is the finalisation-off arm. It is a separate process because the setting is
 * a module-load const: a tree may not change its seeding mid-life without discarding the
 * change token it holds.
 *
 * The delta arms need `treeChangedSince:v1`, so on a backend without it those rows are
 * reported as skipped rather than silently measuring the fallback path.
 */

/** Width and depth of the synthetic tree. Deliberately modest: the shape of the numbers shows
 * up well before a 7k-resource project, and a seed that large would dominate the run. */
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

/** Drops one field name, standing in for the real project pruning. Enough to make the
 * pruning dimension cost something without importing the middle layer. */
const benchPruning = (r: ExtendedResourceData): FieldData[] =>
  r.fields.filter((f) => !f.name.startsWith("pruneMe"));

async function seedTree(
  pl: PlClient,
): Promise<{ root: SignedResourceId; leaves: SignedResourceId[] }> {
  return await pl.withWriteTx(
    "BenchSeed",
    async (tx) => {
      const root = tx.createStruct(TestStructuralResourceType1);
      const rootField = field(tx.clientRoot, "benchRoot");
      tx.createField(rootField, "Dynamic");
      tx.setField(rootField, root);

      const leaves: Promise<SignedResourceId>[] = [];
      for (let c = 0; c < CHILDREN; c++) {
        const child = tx.createStruct(TestStructuralResourceType1);
        const cf = field(root, `child${c}`);
        tx.createField(cf, "Dynamic");
        tx.setField(cf, child);

        // A field the pruning function removes, so prune=on and prune=off differ.
        const pruned = tx.createStruct(TestStructuralResourceType1);
        const pf = field(child, "pruneMe");
        tx.createField(pf, "Dynamic");
        tx.setField(pf, pruned);

        for (let g = 0; g < GRANDCHILDREN; g++) {
          const grand = tx.createStruct(TestStructuralResourceType1);
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
async function touchLeaf(pl: PlClient, leaf: SignedResourceId, round: number) {
  await pl.withWriteTx(
    "BenchTouch",
    async (tx: PlTransaction) => {
      tx.setKValue(leaf, `bench${round}`, Buffer.from(`r${round}`));
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
  newOrChanged: number;
  ms: number;
};

async function runArm(
  pl: PlClient,
  arm: Arm,
  seed: { root: SignedResourceId; leaves: SignedResourceId[] },
): Promise<Row | undefined> {
  const caps = pl.serverInfo.capabilities ?? [];
  if (arm.mode === "backend-delta" && !hasCapability(caps, "treeChangedSince:v1")) return undefined;

  const state = new PlTreeState([seed.root], DefaultFinalResourceDataPredicate);
  const stat: TreeLoadingStat = initialTreeLoadingStat();
  let token: Uint8Array | undefined;

  // Initial load plus POLL_CYCLES steady-state polls, each preceded by one mutation. The
  // initial load is included on purpose: it is the cold-open cost, and it is where the arms
  // are meant to look alike.
  for (let cycle = 0; cycle <= POLL_CYCLES; cycle++) {
    if (cycle > 0) {
      const leaf = seed.leaves[cycle % seed.leaves.length];
      if (leaf !== undefined) await touchLeaf(pl, leaf, cycle);
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
    newOrChanged: stat.resourcesNew + stat.resourcesChanged,
    ms: stat.millisSpent,
  };
}

function report(rows: Row[], finalisation: boolean, skipped: string[]) {
  const pad = (s: string | number, n: number) => String(s).padStart(n);
  const lines = [
    "",
    `=== tree loading cost, finalisation=${finalisation ? "on" : "off"} ===`,
    `tree: ${CHILDREN} children x ${GRANDCHILDREN} grandchildren, ${POLL_CYCLES} polls after load,`,
    `      one KV write on a leaf between polls (quiet-parent shape)`,
    "",
    `${"arm".padEnd(28)} ${pad("trips", 6)} ${pad("res", 6)} ${pad("bytes", 8)} ${pad("seeds", 6)} ${pad("resolv", 7)} ${pad("unchgd", 7)} ${pad("wasted", 7)} ${pad("moved", 6)} ${pad("ms", 7)}`,
  ];
  for (const r of rows) {
    lines.push(
      `${r.arm.padEnd(28)} ${pad(r.roundTrips, 6)} ${pad(r.resources, 6)} ${pad(r.bytes, 8)} ${pad(r.seeds, 6)} ${pad(r.resolutions, 7)} ${pad(r.unchanged, 7)} ${pad(r.wastedBytes, 7)} ${pad(r.newOrChanged, 6)} ${pad(r.ms, 7)}`,
    );
  }
  if (skipped.length > 0) {
    lines.push("", `skipped (backend lacks treeChangedSince:v1): ${skipped.join(", ")}`);
  }
  lines.push(
    "",
    "  res/bytes  what the arm actually pulled down; lower is the win",
    "  unchgd     resources re-fetched only to be found unchanged; delta should be 0",
    "  wasted     bytes in that unchanged bucket",
    "  moved      resources genuinely new or changed; must match across arms or an arm lost an update",
    "  seeds      seed ids sent, summed over rounds; this is what finalisation costs",
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

    for (const arm of ARMS) {
      const row = await runArm(pl, arm, seed);
      if (row === undefined) skipped.push(arm.label.trim());
      else rows.push(row);
    }

    report(rows, process.env.PL_TREE_NO_FINALISATION !== "1", skipped);
  });
}, 600_000);
