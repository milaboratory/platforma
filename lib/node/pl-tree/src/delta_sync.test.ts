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
        fieldFilter: {},
      }),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.seeds).toEqual(["NG:0x1", "NG:0x2"]);
    expect(calls[0]?.opts.includeKv).toBe(true);
    expect(calls[0]?.opts.changedSinceToken).toEqual(new Uint8Array([7]));
    expect(calls[0]?.opts.fieldFilter).toEqual({});
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

  test("ignores a stop-marker frame, which a delta walk should never produce", async () => {
    const warnings: string[] = [];
    const { tx } = txReturning([
      [{ frameKind: "stopMarker", id: "NG:0x5", traverseWasStopped: true }, frame("NG:0x1")],
    ]);

    const result = await loadDeltaTreeState(
      tx,
      request({ seedResources: ["NG:0x1"], knownResources: new Set(["NG:0x1"]) }),
      undefined,
      { warn: (m) => warnings.push(m) },
    );

    expect(result.map((r) => r.id)).toEqual(["NG:0x1"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("NG:0x5");
  });
});

describe("reference resolution", () => {
  test("resolves a reference the delta did not carry, at unconditional depth 0", async () => {
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
    expect(calls[1]?.opts.unconditionalDepth).toBe(0);
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

    expect(calls.map((c) => c.seeds)).toEqual([["NG:0x1"], ["NG:0xA"], ["NG:0xB"]]);
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
