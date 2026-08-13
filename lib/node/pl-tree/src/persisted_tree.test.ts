import { describe, expect, test } from "vitest";
import type { FinalResourceDataPredicate } from "@milaboratories/pl-client";
import { createSignedResourceId, toResourceSignature } from "@milaboratories/pl-client";
import type { ExtendedResourceData } from "./state";
import { PlTreeState } from "./state";
import { constructTreeLoadingRequest } from "./sync";
import {
  captureTreeState,
  decodePersistedTree,
  encodePersistedTree,
  PERSISTED_TREE_SCHEMA_VERSION,
  readPersistedTreeHeader,
  restoreTreeState,
} from "./persisted_tree";
import {
  dField,
  iField,
  TestDynamicRootState1,
  TestStructuralResourceState1,
  TestValueResourceState1,
} from "./test_utils";

const sig = (hex: string) => toResourceSignature(Buffer.from(hex, "hex"));

/** Ids here carry real signature bytes, unlike the shared test fixtures, so the
 *  global-id / signature split is actually exercised rather than trivially satisfied. */
const rid = (id: bigint, signature = "a1b2c3d4") => createSignedResourceId(id, sig(signature));

const RootSignature = sig("deadbeef");
const RootId = createSignedResourceId(1000001n, RootSignature);

/** The shared fixtures use resource types `DefaultFinalResourceDataPredicate` does not know,
 *  so it settles nothing and the tree has no final/non-final split to test. Trusting the
 *  backend's derived flag instead gives one, which is what the loading request is built from. */
const finalByFlag: FinalResourceDataPredicate = (r) => r.final;

/** A tree with a settled branch, an unsettled branch, data, kv, a dynamic field pointing at
 *  a value, and an unresolved field. Enough shape that a codec losing a distinction the tree
 *  cares about shows up as a different loading request. */
function buildPopulatedTree(): PlTreeState {
  const tree = new PlTreeState(RootId, finalByFlag);
  tree.updateFromResourceData([
    {
      ...TestDynamicRootState1,
      id: RootId,
      fields: [dField("settled", rid(10n)), dField("running", rid(20n)), dField("pending")],
    },
    {
      ...TestStructuralResourceState1,
      id: rid(10n),
      inputsLocked: true,
      outputsLocked: true,
      resourceReady: true,
      final: true,
      fields: [iField("payload", rid(11n))],
      kv: [
        { key: "meta", value: Buffer.from('{"n":1}') },
        { key: "binary", value: Uint8Array.from([0, 1, 2, 255]) },
      ],
    },
    {
      ...TestValueResourceState1,
      id: rid(11n),
      data: Buffer.from("settled payload"),
    },
    {
      ...TestStructuralResourceState1,
      id: rid(20n),
      fields: [iField("payload"), dField("progress", rid(21n))],
    },
    {
      ...TestValueResourceState1,
      id: rid(21n),
      data: Buffer.from("in progress"),
    },
  ]);
  return tree;
}

/** The claim the whole design rests on: what comes back addresses the backend the same way
 *  the original did. Compared as sorted arrays because neither the seed order nor the skip
 *  set's iteration order is part of the contract. */
function loadingRequestOf(tree: PlTreeState) {
  const req = constructTreeLoadingRequest(tree);
  return {
    seeds: [...req.seedResources].sort(),
    skips: [...req.finalResources].sort(),
  };
}

async function roundTrip(tree: PlTreeState, compress?: boolean): Promise<PlTreeState> {
  const captured = captureTreeState(tree, RootSignature);
  const bytes = await encodePersistedTree(captured, { compress });

  const decoded = await decodePersistedTree(bytes);
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error("unreachable");

  const restored = restoreTreeState(decoded.value, finalByFlag);
  expect(restored).toBeDefined();
  return restored!;
}

describe("the contract", () => {
  test.for([true, false])(
    "restored tree builds the same loading request (compress: %s)",
    async (compress) => {
      const original = buildPopulatedTree();
      const restored = await roundTrip(original, compress);

      const expected = loadingRequestOf(original);
      // Guards against a vacuous pass: an empty tree would match trivially.
      expect(expected.seeds.length).toBeGreaterThan(0);
      expect(expected.skips.length).toBeGreaterThan(0);

      expect(loadingRequestOf(restored)).toStrictEqual(expected);
    },
  );

  test("restored tree holds the same resource states", async () => {
    const original = buildPopulatedTree();
    const restored = await roundTrip(original);

    // Byte payloads are compared as plain arrays: the decoder hands back Uint8Array views
    // while the fixtures were built from Buffers, and strict equality would read that
    // prototype difference as a difference in state.
    const asBytes = (b?: Uint8Array) => (b === undefined ? undefined : [...b]);
    const normalize = (r: ExtendedResourceData) => ({
      ...r,
      data: asBytes(r.data),
      kv: r.kv.map((e) => ({ key: e.key, value: asBytes(e.value) })),
    });
    const states = (tree: PlTreeState) =>
      tree
        .dumpState()
        .map(normalize)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    expect(states(restored)).toStrictEqual(states(original));
  });

  test("roots survive the round trip", async () => {
    const original = buildPopulatedTree();
    const restored = await roundTrip(original);
    expect([...restored.roots]).toStrictEqual([...original.roots]);
  });

  test("finality is recomputed, not read from the file", async () => {
    const original = buildPopulatedTree();
    const captured = captureTreeState(original, RootSignature);
    const decoded = await decodePersistedTree(await encodePersistedTree(captured));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error("unreachable");

    // A predicate that settles nothing must yield a tree that skips nothing, even though
    // the file says otherwise. The file's finality is an artefact of the predicate in force
    // when it was written, and the two are allowed to disagree.
    const restored = restoreTreeState(decoded.value, () => false);
    expect(restored).toBeDefined();
    expect(constructTreeLoadingRequest(restored!).finalResources.size).toBe(0);
    expect(constructTreeLoadingRequest(original).finalResources.size).toBeGreaterThan(0);
  });
});

describe("the witness", () => {
  test("is readable without inflating the payload", async () => {
    const captured = captureTreeState(buildPopulatedTree(), RootSignature);
    const bytes = await encodePersistedTree(captured);

    const header = readPersistedTreeHeader(bytes);
    expect(header.ok).toBe(true);
    if (!header.ok) throw new Error("unreachable");

    expect(header.value.schemaVersion).toBe(PERSISTED_TREE_SCHEMA_VERSION);
    expect(Buffer.from(header.value.witness).equals(Buffer.from(RootSignature))).toBe(true);
  });
});

describe("a snapshot that cannot be read", () => {
  const encoded = async () =>
    await encodePersistedTree(captureTreeState(buildPopulatedTree(), RootSignature));

  test("a foreign file is not a snapshot", async () => {
    const result = await decodePersistedTree(Buffer.from("this is not a tree snapshot at all"));
    expect(result).toStrictEqual({ ok: false, reason: "not-a-snapshot" });
  });

  test("an empty file is not a snapshot", async () => {
    expect(await decodePersistedTree(Buffer.alloc(0))).toStrictEqual({
      ok: false,
      reason: "not-a-snapshot",
    });
  });

  test("a truncated file is rejected rather than replayed", async () => {
    const bytes = await encoded();
    const result = await decodePersistedTree(bytes.subarray(0, bytes.length - 32));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(["truncated", "checksum"]).toContain(result.reason);
  });

  test("a damaged payload fails its checksum", async () => {
    const bytes = Buffer.from(await encoded());
    // Flip a bit inside the payload, leaving the header and the length trailer intact.
    const target = Math.floor(bytes.length / 2);
    bytes[target] = bytes[target] ^ 0xff;

    expect(await decodePersistedTree(bytes)).toStrictEqual({ ok: false, reason: "checksum" });
  });

  test("an unknown schema version loads as absent", async () => {
    const bytes = Buffer.from(await encoded());
    bytes.writeUInt16LE(PERSISTED_TREE_SCHEMA_VERSION + 1, 4);

    expect(await decodePersistedTree(bytes)).toStrictEqual({ ok: false, reason: "unknown-schema" });
    expect(readPersistedTreeHeader(bytes)).toStrictEqual({ ok: false, reason: "unknown-schema" });
  });

  test("every truncation point is a clean failure, never a throw", async () => {
    const bytes = await encoded();
    for (let length = 0; length < bytes.length; length++) {
      const result = await decodePersistedTree(bytes.subarray(0, length));
      expect(result.ok).toBe(false);
    }
  });
});

describe("a snapshot that decodes but cannot be applied", () => {
  test("a dangling reference leaves no tree and does not throw", async () => {
    const tree = buildPopulatedTree();
    const captured = captureTreeState(tree, RootSignature);

    // Drop a resource that others still point at. The codec has no opinion on this; the
    // state-update call is what refuses it, which is the point of reusing that path.
    const dangling = {
      ...captured,
      resources: captured.resources.filter((r) => r.id !== rid(11n)),
    };
    const decoded = await decodePersistedTree(await encodePersistedTree(dangling));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error("unreachable");

    expect(restoreTreeState(decoded.value, finalByFlag)).toBeUndefined();
  });

  test("a live tree survives a failed restore", async () => {
    const live = buildPopulatedTree();
    const before = loadingRequestOf(live);

    const captured = captureTreeState(live, RootSignature);
    const decoded = await decodePersistedTree(
      await encodePersistedTree({
        ...captured,
        resources: captured.resources.filter((r) => r.id !== rid(11n)),
      }),
    );
    if (!decoded.ok) throw new Error("unreachable");
    expect(restoreTreeState(decoded.value, finalByFlag)).toBeUndefined();

    // The throwaway tree absorbed the invalidation, so the working tree is untouched.
    expect(live.isValid).toBe(true);
    expect(loadingRequestOf(live)).toStrictEqual(before);
  });
});

describe("capture", () => {
  test("refuses an invalidated tree", () => {
    const tree = buildPopulatedTree();
    tree.invalidateTree("test");
    expect(() => captureTreeState(tree, RootSignature)).toThrow(/invalidated/);
  });

  test("an empty tree round trips", async () => {
    const empty = new PlTreeState(RootId, finalByFlag);
    const restored = await roundTrip(empty);
    expect(loadingRequestOf(restored)).toStrictEqual(loadingRequestOf(empty));
    // An unmaterialized root is still seeded, which is how a cold tree starts.
    expect(loadingRequestOf(restored).seeds).toStrictEqual([RootId]);
  });
});
