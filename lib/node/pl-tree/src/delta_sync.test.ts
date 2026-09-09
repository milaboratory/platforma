import { test, expect, describe } from "vitest";
import { NullSignedResourceId } from "@milaboratories/pl-client";
import { loadDeltaTreeState } from "./delta_sync";
import { initialTreeLoadingStat } from "./sync";
import type { TreeLoadingRequest, TreeLoadingStat } from "./sync";

type Frame = Record<string, unknown>;

/** A `"resource"` frame, which under a token is the only kind a delta walk produces. */
function frame(id: string, opts: { fields?: Frame[]; error?: string; kv?: Frame[] } = {}): Frame {
  return {
    frameKind: "resource",
    id,
    type: { name: "Projects", version: "1" },
    kind: "Structural",
    data: undefined,
    resourceReady: false,
    error: opts.error ?? NullSignedResourceId,
    originalResourceId: NullSignedResourceId,
    final: false,
    inputsLocked: false,
    outputsLocked: false,
    fields: opts.fields ?? [],
    kv: opts.kv ?? [],
    traverseWasStopped: false,
  };
}

function field(name: string, value: string): Frame {
  return {
    name,
    type: "Dynamic",
    value,
    error: NullSignedResourceId,
    status: "Resolved",
    valueIsFinal: false,
  };
}

type Call = { seeds: string[]; opts: Record<string, unknown> };

/** A tx whose `resourceTree` replays one canned response per call, recording what it was
 * asked for. */
function txReturning(responses: Frame[][]) {
  const calls: Call[] = [];
  const tx = {
    resourceTree: (seeds: string[], opts: Record<string, unknown>) => {
      calls.push({ seeds, opts });
      const batch = responses[calls.length - 1] ?? [];
      return (async function* () {
        for (const f of batch) yield f;
      })();
    },
  } as unknown as Parameters<typeof loadDeltaTreeState>[0];
  return { tx, calls };
}

function request(over: Partial<Record<keyof TreeLoadingRequest, unknown>> = {}) {
  return {
    seedResources: [],
    finalResources: new Set<string>(),
    roots: ["NG:root"],
    knownResources: new Set<string>(),
    changedSinceToken: new Uint8Array([7]),
    ...over,
  } as unknown as TreeLoadingRequest;
}

describe("seeding", () => {
  test("seeds the non-final frontier, not the roots, and passes the token", async () => {
    const { tx, calls } = txReturning([[]]);

    await loadDeltaTreeState(
      tx,
      request({
        seedResources: ["NG:0x1", "NG:0x2"],
        roots: ["NG:root"],
        knownResources: new Set(["NG:0x1", "NG:0x2", "NG:root"]),
        fieldFilter: { marker: "field" },
        // constructTreeLoadingRequest still populates this and the ML passes one, so the
        // request genuinely carries stop rules here: the assertion below has to see the
        // delta path drop them rather than never having had them.
        traverseStopRules: { marker: "stop" },
      }),
    );

    expect(calls).toHaveLength(1);
    // Every non-final resource is a seed, never the roots alone.
    expect(calls[0]?.seeds).toEqual(["NG:0x1", "NG:0x2"]);
    expect(calls[0]?.opts.includeKv).toBe(true);
    expect(calls[0]?.opts.changedSinceToken).toEqual(new Uint8Array([7]));
    expect(calls[0]?.opts.fieldFilter).toEqual({ marker: "field" });
    // Stop rules are inert under a token, so the delta walk must not send them.
    expect(calls[0]?.opts.traverseStopRules).toBeUndefined();
  });

  test("falls back to the roots when every resource is final", async () => {
    const { tx, calls } = txReturning([[]]);

    await loadDeltaTreeState(tx, request({ seedResources: [], roots: ["NG:root"] }));

    expect(calls[0]?.seeds).toEqual(["NG:root"]);
  });

  test("does no round trip at all when there is nothing to seed", async () => {
    const { tx, calls } = txReturning([[]]);

    const result = await loadDeltaTreeState(tx, request({ seedResources: [], roots: [] }));

    expect(calls).toHaveLength(0);
    expect(result).toEqual([]);
  });
});

describe("delta response", () => {
  test("an all-unchanged poll yields nothing and costs one round trip", async () => {
    const stats: TreeLoadingStat = initialTreeLoadingStat();
    const { tx, calls } = txReturning([[]]);

    const result = await loadDeltaTreeState(
      tx,
      request({ seedResources: ["NG:0x1"], knownResources: new Set(["NG:0x1"]) }),
      stats,
    );

    expect(result).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(stats.roundTrips).toBe(1);
    expect(stats.deltaResolutionRounds).toBe(0);
    expect(stats.retrievedResources).toBe(0);
  });

  test("applies the pruning function and counts what it dropped", async () => {
    const stats: TreeLoadingStat = initialTreeLoadingStat();
    const { tx } = txReturning([
      [frame("NG:0x1", { fields: [field("keep", "NG:0x9"), field("drop", "NG:0x8")] })],
    ]);

    const result = await loadDeltaTreeState(
      tx,
      request({
        seedResources: ["NG:0x1"],
        // Both field targets already held, so pruning is the only thing under test.
        knownResources: new Set(["NG:0x1", "NG:0x9", "NG:0x8"]),
        pruningFunction: (r: { fields: { name: string }[] }) =>
          r.fields.filter((f) => f.name === "keep"),
      }),
      stats,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.fields.map((f) => f.name)).toEqual(["keep"]);
    expect(stats.prunedFields).toBe(1);
    expect(stats.retrievedFields).toBe(1);
  });

  test("ignores a stop-marker frame, which the server cannot emit for a delta walk", async () => {
    const { tx } = txReturning([
      [{ frameKind: "stopMarker", id: "NG:0x5", traverseWasStopped: true }, frame("NG:0x1")],
    ]);

    const result = await loadDeltaTreeState(
      tx,
      request({ seedResources: ["NG:0x1"], knownResources: new Set(["NG:0x1"]) }),
    );

    expect(result.map((r) => r.id)).toEqual(["NG:0x1"]);
  });
});

describe("final resources", () => {
  test("skips a body for a resource the mirror already marked final", async () => {
    const stats: TreeLoadingStat = initialTreeLoadingStat();
    // A token-less poll (first poll after a warm start, or after a token discard) is a full
    // walk with no stop rules, so the backend emits bodies for final resources sitting under
    // a non-final seed. updateFromResourceData throws on any body for a held final resource,
    // so the batch must not carry them.
    const { tx } = txReturning([[frame("NG:0x1"), frame("NG:0xFINAL")]]);

    const result = await loadDeltaTreeState(
      tx,
      request({
        seedResources: ["NG:0x1"],
        finalResources: new Set(["NG:0xFINAL"]),
        knownResources: new Set(["NG:0x1", "NG:0xFINAL"]),
        changedSinceToken: undefined,
      }),
      stats,
    );

    expect(result.map((r) => r.id)).toEqual(["NG:0x1"]);
    expect(stats.finalResourcesSkipped).toBe(1);
  });

  test("a skipped final resource still satisfies references pointing at it", async () => {
    // Dropping it from the batch must not make it look unresolved: it is in the mirror.
    const { tx, calls } = txReturning([
      [frame("NG:0x1", { fields: [field("out", "NG:0xFINAL")] }), frame("NG:0xFINAL")],
    ]);

    await loadDeltaTreeState(
      tx,
      request({
        seedResources: ["NG:0x1"],
        finalResources: new Set(["NG:0xFINAL"]),
        knownResources: new Set(["NG:0x1", "NG:0xFINAL"]),
      }),
    );

    expect(calls).toHaveLength(1);
  });
});

describe("diagnostics", () => {
  test("warns when stop rules are supplied to a token-less poll", async () => {
    const warnings: string[] = [];
    const { tx } = txReturning([[]]);

    await loadDeltaTreeState(
      tx,
      request({
        seedResources: ["NG:0x1"],
        knownResources: new Set(["NG:0x1"]),
        traverseStopRules: { marker: "stop" },
        changedSinceToken: undefined,
      }),
      undefined,
      { warn: (m) => warnings.push(m) },
    );

    expect(warnings.some((w) => w.includes("unpruned"))).toBe(true);
  });

  test("does not warn about stop rules when a token makes them moot", async () => {
    const warnings: string[] = [];
    const { tx } = txReturning([[]]);

    await loadDeltaTreeState(
      tx,
      request({
        seedResources: ["NG:0x1"],
        knownResources: new Set(["NG:0x1"]),
        traverseStopRules: { marker: "stop" },
      }),
      undefined,
      { warn: (m) => warnings.push(m) },
    );

    expect(warnings).toEqual([]);
  });

  test("flags a token poll answered with the whole mirror as a suspected rejection", async () => {
    const stats: TreeLoadingStat = initialTreeLoadingStat();
    const warnings: string[] = [];
    // Two held resources, and the response carries both: what a refused token looks like.
    const { tx } = txReturning([[frame("NG:0x1"), frame("NG:0x2")]]);

    await loadDeltaTreeState(
      tx,
      request({
        seedResources: ["NG:0x1", "NG:0x2"],
        roots: ["NG:0x1"],
        knownResources: new Set(["NG:0x1", "NG:0x2"]),
      }),
      stats,
      { warn: (m) => warnings.push(m) },
    );

    expect(stats.deltaSuspectedFullAnswers).toBe(1);
    expect(warnings.some((w) => w.includes("refused the token"))).toBe(true);
  });

  test("does not flag an ordinary delta that moved one resource of many", async () => {
    const stats: TreeLoadingStat = initialTreeLoadingStat();
    const { tx } = txReturning([[frame("NG:0x1")]]);

    await loadDeltaTreeState(
      tx,
      request({
        seedResources: ["NG:0x1", "NG:0x2", "NG:0x3"],
        knownResources: new Set(["NG:0x1", "NG:0x2", "NG:0x3"]),
      }),
      stats,
    );

    expect(stats.deltaSuspectedFullAnswers).toBe(0);
  });
});

describe("reference resolution", () => {
  test("resolves a reference the delta did not carry, at a subtree-clearing depth", async () => {
    const stats: TreeLoadingStat = initialTreeLoadingStat();
    const { tx, calls } = txReturning([
      // Poll: a held resource repointed at a resource we have never seen.
      [frame("NG:0x1", { fields: [field("out", "NG:0xNEW")] })],
      // Resolution round serves it.
      [frame("NG:0xNEW")],
    ]);

    const result = await loadDeltaTreeState(
      tx,
      request({ seedResources: ["NG:0x1"], knownResources: new Set(["NG:0x1"]) }),
      stats,
    );

    expect(calls).toHaveLength(2);
    expect(calls[1]?.seeds).toEqual(["NG:0xNEW"]);
    // Deep, not 0: at 0 a newly attached subtree costs one round trip per level.
    expect(calls[1]?.opts.unconditionalDepth).toBeGreaterThan(1);
    // The token still rides the resolution round: what it returns is dated the same as the
    // poll it came with.
    expect(calls[1]?.opts.changedSinceToken).toEqual(new Uint8Array([7]));
    expect(result.map((r) => r.id).sort()).toEqual(["NG:0x1", "NG:0xNEW"]);
    expect(stats.deltaResolutionRounds).toBe(1);
    expect(stats.deltaSeedsSent).toBe(2);
  });

  test("needs no round when every reference is already in the mirror", async () => {
    const { tx, calls } = txReturning([[frame("NG:0x1", { fields: [field("out", "NG:0xOLD")] })]]);

    await loadDeltaTreeState(
      tx,
      request({
        seedResources: ["NG:0x1"],
        knownResources: new Set(["NG:0x1", "NG:0xOLD"]),
      }),
    );

    expect(calls).toHaveLength(1);
  });

  test("follows a chain of references across successive rounds", async () => {
    const { tx, calls } = txReturning([
      [frame("NG:0x1", { fields: [field("out", "NG:0xA")] })],
      [frame("NG:0xA", { fields: [field("out", "NG:0xB")] })],
      [frame("NG:0xB")],
    ]);

    const result = await loadDeltaTreeState(
      tx,
      request({ seedResources: ["NG:0x1"], knownResources: new Set(["NG:0x1"]) }),
    );

    // Only the resolution rounds are under test here, so the first (seeding) call is
    // excluded: which ids seed the poll is the seeding tests' business.
    expect(calls.slice(1).map((c) => c.seeds)).toEqual([["NG:0xA"], ["NG:0xB"]]);
    expect(result).toHaveLength(3);
  });

  test("resolves a resource error reference, not just field targets", async () => {
    const { tx, calls } = txReturning([
      [frame("NG:0x1", { error: "NG:0xERR" })],
      [frame("NG:0xERR")],
    ]);

    await loadDeltaTreeState(
      tx,
      request({ seedResources: ["NG:0x1"], knownResources: new Set(["NG:0x1"]) }),
    );

    expect(calls[1]?.seeds).toEqual(["NG:0xERR"]);
  });

  test("asks for a shared reference once, however many bodies point at it", async () => {
    const { tx, calls } = txReturning([
      [
        frame("NG:0x1", { fields: [field("out", "NG:0xSHARED")] }),
        frame("NG:0x2", { fields: [field("out", "NG:0xSHARED")] }),
      ],
      [frame("NG:0xSHARED")],
    ]);

    await loadDeltaTreeState(
      tx,
      request({
        seedResources: ["NG:0x1", "NG:0x2"],
        knownResources: new Set(["NG:0x1", "NG:0x2"]),
      }),
    );

    expect(calls).toHaveLength(2);
    expect(calls[1]?.seeds).toEqual(["NG:0xSHARED"]);
  });

  test("gives up after a bounded number of rounds rather than looping on round trips", async () => {
    // A backend that always answers with one more unknown reference. Without a cap this walks
    // one sequential round trip per link, forever.
    let n = 0;
    const tx = {
      resourceTree: () => {
        const id = `NG:0xCHAIN${n++}`;
        return (async function* () {
          yield frame(id, { fields: [field("next", `NG:0xCHAIN${n}`)] });
        })();
      },
    } as unknown as Parameters<typeof loadDeltaTreeState>[0];

    await expect(
      loadDeltaTreeState(
        tx,
        request({ seedResources: ["NG:0x1"], knownResources: new Set(["NG:0x1"]) }),
      ),
    ).rejects.toThrow(/still unresolved after \d+ rounds/);
    // Bounded: a handful of round trips, not one per link in an unbounded chain.
    expect(n).toBeLessThan(30);
  });

  test("throws with the ids rather than letting the apply invalidate the tree", async () => {
    // The backend never serves the referenced resource, so the loop cannot make progress.
    const { tx, calls } = txReturning([
      [frame("NG:0x1", { fields: [field("out", "NG:0xGONE")] })],
      [],
    ]);

    await expect(
      loadDeltaTreeState(
        tx,
        request({ seedResources: ["NG:0x1"], knownResources: new Set(["NG:0x1"]) }),
      ),
    ).rejects.toThrow("NG:0xGONE");

    // One poll, one resolution attempt, then it gives up instead of looping.
    expect(calls).toHaveLength(2);
  });
});
