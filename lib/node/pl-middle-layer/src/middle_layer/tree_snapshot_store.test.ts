import { beforeEach, describe, expect, test } from "vitest";
import type { PlClient, SignedResourceId } from "@milaboratories/pl-client";
import {
  createSignedResourceId,
  parseSignedResourceId,
  toResourceSignature,
} from "@milaboratories/pl-client";
import type { PersistedTree } from "@milaboratories/pl-tree";
import type { MiLogger } from "@milaboratories/ts-helpers";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TreeSnapshotStore } from "./tree_snapshot_store";

const silent: MiLogger = { info: () => {}, warn: () => {}, error: () => {} };

const sig = (hex: string) => toResourceSignature(Buffer.from(hex, "hex"));

/** Only the fields the store reads. */
function fakeClient(
  ops: { host?: string; user?: string | null; asUser?: string; instanceId?: string } = {},
): PlClient {
  return {
    conf: { hostAndPort: ops.host ?? "localhost:6345", asUser: ops.asUser },
    serverInfo: { instanceId: ops.instanceId ?? "instance-1" },
    authUser: ops.user === undefined ? "someone@example.com" : ops.user,
  } as unknown as PlClient;
}

/** A snapshot with roots and no resources: enough to exercise the store, since the codec is
 *  tested against real trees in pl-tree. */
function snapshotFor(root: SignedResourceId): PersistedTree {
  return {
    witness: parseSignedResourceId(root).signature,
    roots: [root],
    resources: [],
  };
}

let dir: string;

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "tree-snapshots-"));
});

function storeIn(
  dirPath: string = dir,
  ops: { maxSizeBytes?: number; enabled?: boolean; client?: PlClient } = {},
): TreeSnapshotStore | undefined {
  return TreeSnapshotStore.create(ops.client ?? fakeClient(), {
    dir: dirPath,
    maxSizeBytes: ops.maxSizeBytes ?? 256 * 1024 * 1024,
    enabled: ops.enabled ?? true,
    logger: silent,
  });
}

const rootA = createSignedResourceId(1001n, sig("aaaa"));
const rootB = createSignedResourceId(1002n, sig("bbbb"));

async function files(): Promise<string[]> {
  return (await fsp.readdir(dir)).sort();
}

describe("when the store should not exist at all", () => {
  test("disabled by configuration", () => {
    expect(storeIn(dir, { enabled: false })).toBeUndefined();
  });

  test("client is impersonating another user", () => {
    // Reading or writing here would leave another user's mirror at rest under the admin's
    // identity, so nothing is persisted for an impersonated client.
    const client = fakeClient({ asUser: "someone-else@example.com" });
    expect(storeIn(dir, { client })).toBeUndefined();
  });
});

describe("purge", () => {
  test("removes our files, so turning the switch off reclaims the disk", async () => {
    const store = storeIn()!;
    await store.write(rootA, snapshotFor(rootA));
    await store.write(rootB, snapshotFor(rootB));
    expect(await files()).toHaveLength(2);

    await TreeSnapshotStore.purge(dir, silent);
    await expect(fsp.stat(dir)).rejects.toThrow();
  });

  test("leaves anything that is not ours, and the directory holding it", async () => {
    const store = storeIn()!;
    await store.write(rootA, snapshotFor(rootA));
    // The path is caller-supplied, so a misconfigured one must not take a stranger's files
    // with it.
    await fsp.writeFile(path.join(dir, "someone-elses.txt"), "not ours");

    await TreeSnapshotStore.purge(dir, silent);

    expect(await files()).toStrictEqual(["someone-elses.txt"]);
  });

  test("is quiet about a directory that is not there", async () => {
    await expect(
      TreeSnapshotStore.purge(path.join(dir, "never-existed"), silent),
    ).resolves.toBeUndefined();
  });
});

describe("reporting failure", () => {
  test("a failed write says so, rather than reporting a phantom success", async () => {
    // A file where the directory should be, so every write fails.
    const occupied = path.join(dir, "occupied");
    await fsp.writeFile(occupied, "in the way");
    const store = storeIn(occupied)!;

    expect(await store.write(rootA, snapshotFor(rootA))).toBe(false);
    expect(store.getStats().writeFailures).toBe(1);
  });

  test("a successful write says so", async () => {
    const store = storeIn()!;
    expect(await store.write(rootA, snapshotFor(rootA))).toBe(true);
  });

  test("an unreadable file is not reported as absent", async () => {
    const store = storeIn()!;
    await store.write(rootA, snapshotFor(rootA));

    // Replace the file with a directory: present, but unopenable.
    const [name] = await files();
    const file = path.join(dir, name);
    await fsp.rm(file);
    await fsp.mkdir(file);

    const read = await store.read(rootA);
    expect(read).toStrictEqual({ ok: false, miss: "unreadable" });
    expect(store.getStats().misses.absent).toBe(0);
  });
});

describe("round trip", () => {
  test("a written snapshot reads back", async () => {
    const store = storeIn()!;
    await store.write(rootA, snapshotFor(rootA));

    const read = await store.read(rootA);
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error("unreachable");
    expect(read.tree.roots).toStrictEqual([rootA]);

    expect(store.getStats().writes).toBe(1);
    expect(store.getStats().hits).toBe(1);
  });

  test("nothing written means an absent miss", async () => {
    const store = storeIn()!;
    expect(await store.read(rootA)).toStrictEqual({ ok: false, miss: "absent" });
    expect(store.getStats().misses.absent).toBe(1);
  });

  test("one file per project, rewritten in place", async () => {
    const store = storeIn()!;
    await store.write(rootA, snapshotFor(rootA));
    await store.write(rootA, snapshotFor(rootA));
    await store.write(rootB, snapshotFor(rootB));

    expect(await files()).toHaveLength(2);
  });

  test("a successful write leaves no staging file behind", async () => {
    const store = storeIn()!;
    await store.write(rootA, snapshotFor(rootA));
    expect((await files()).filter((f) => f.includes(".tmp."))).toStrictEqual([]);
  });

  test("discard removes the file", async () => {
    const store = storeIn()!;
    await store.write(rootA, snapshotFor(rootA));
    await store.discard(rootA);

    expect(await files()).toStrictEqual([]);
    expect(await store.read(rootA)).toStrictEqual({ ok: false, miss: "absent" });
  });
});

describe("the session witness", () => {
  test("a rotated signature is a miss, and the file is kept", async () => {
    const store = storeIn()!;
    await store.write(rootA, snapshotFor(rootA));

    // Same resource, next session: same global id, different signature. The file is addressed
    // by global id, so this is the same file, and only the witness distinguishes them.
    const rotated = createSignedResourceId(1001n, sig("cccc"));
    expect(await store.read(rotated)).toStrictEqual({ ok: false, miss: "session-rotated" });

    // Kept on purpose: the bodies stay valid, only the signatures died, so a future signature
    // refresh would have something to repair.
    expect(await files()).toHaveLength(1);
  });
});

describe("a snapshot that cannot be read", () => {
  test("a truncated file misses without raising", async () => {
    const store = storeIn()!;
    await store.write(rootA, snapshotFor(rootA));

    const [name] = await files();
    const file = path.join(dir, name);
    const bytes = await fsp.readFile(file);
    await fsp.writeFile(file, bytes.subarray(0, bytes.length - 6));

    const read = await store.read(rootA);
    expect(read.ok).toBe(false);
    if (read.ok) throw new Error("unreachable");
    expect(["truncated", "checksum"]).toContain(read.miss);
  });

  test("a foreign file in our own filename misses without raising", async () => {
    const store = storeIn()!;
    await store.write(rootA, snapshotFor(rootA));
    const [name] = await files();
    await fsp.writeFile(path.join(dir, name), "not a snapshot at all");

    expect(await store.read(rootA)).toStrictEqual({ ok: false, miss: "not-a-snapshot" });
  });
});

describe("the key", () => {
  test("another backend does not see this one's snapshots", async () => {
    await storeIn()!.write(rootA, snapshotFor(rootA));

    const other = storeIn(dir, { client: fakeClient({ host: "elsewhere:6345" }) })!;
    expect(await other.read(rootA)).toStrictEqual({ ok: false, miss: "absent" });
  });

  test("another user does not see this one's snapshots", async () => {
    await storeIn()!.write(rootA, snapshotFor(rootA));

    const other = storeIn(dir, { client: fakeClient({ user: "other@example.com" }) })!;
    expect(await other.read(rootA)).toStrictEqual({ ok: false, miss: "absent" });
  });

  test("a backend that reset its database does not see the old state's snapshots", async () => {
    await storeIn()!.write(rootA, snapshotFor(rootA));

    // Same address, same user, new instance: global ids are reused after a reset, so the
    // address alone would be a hit against a tree that no longer exists.
    const reset = storeIn(dir, { client: fakeClient({ instanceId: "instance-2" }) })!;
    expect(await reset.read(rootA)).toStrictEqual({ ok: false, miss: "absent" });
  });
});

describe("eviction", () => {
  test("drops what is not addressed to the current scope", async () => {
    const store = storeIn()!;
    await store.write(rootA, snapshotFor(rootA));

    // A snapshot from another build, and a staging file from a write that was killed before
    // its rename. Neither can ever be read again.
    await fsp.writeFile(path.join(dir, "tree.1.otherbuild.0123456789abcdef.99.plts"), "old");
    await fsp.writeFile(path.join(dir, "tree.1.thisbuild.0123456789abcdef.99.plts.tmp.ab"), "torn");

    await store.evict();

    expect(await files()).toHaveLength(1);
    expect((await store.read(rootA)).ok).toBe(true);
    expect(store.getStats().evicted).toBe(2);
    expect(store.getStats().evictedForSize).toBe(0);
  });

  test("leaves files that are not ours, whatever the directory holds", async () => {
    const store = storeIn()!;
    await store.write(rootA, snapshotFor(rootA));
    // `treeSnapshotPath` is caller-supplied: pointed at an existing or shared directory,
    // startup housekeeping must not take a stranger's files with it.
    await fsp.writeFile(path.join(dir, "someone-elses.txt"), "not ours");
    await fsp.writeFile(path.join(dir, "tree.txt"), "shares our prefix, not our suffix");

    await store.evict();

    expect(await files()).toContain("someone-elses.txt");
    expect(await files()).toContain("tree.txt");
    expect(store.getStats().evicted).toBe(0);
  });

  test("keeps everything when under the ceiling", async () => {
    const store = storeIn()!;
    await store.write(rootA, snapshotFor(rootA));
    await store.write(rootB, snapshotFor(rootB));

    await store.evict();
    expect(await files()).toHaveLength(2);
    expect(store.getStats().evicted).toBe(0);
  });

  test("trims to the ceiling, least recently written first", async () => {
    const store = storeIn()!;
    await store.write(rootA, snapshotFor(rootA));
    await store.write(rootB, snapshotFor(rootB));

    const names = await files();
    const sizes = await Promise.all(names.map((n) => fsp.stat(path.join(dir, n))));
    const perFile = Math.max(...sizes.map((s) => s.size));

    // Age rootA's file so recency is unambiguous rather than dependent on write order timing.
    const old = new Date(Date.now() - 60 * 60 * 1000);
    const rootAFile = path.join(dir, names.find((n) => n.endsWith(".1001.plts"))!);
    await fsp.utimes(rootAFile, old, old);

    // Room for one file only.
    const tight = storeIn(dir, { maxSizeBytes: perFile })!;
    await tight.evict();

    expect((await tight.read(rootA)).ok).toBe(false);
    expect((await tight.read(rootB)).ok).toBe(true);
    expect(tight.getStats().evictedForSize).toBe(1);
  });

  test("an unusable directory costs the cache, not the startup", async () => {
    // A path that cannot be a directory, because a file already occupies it.
    const occupied = path.join(dir, "occupied");
    await fsp.writeFile(occupied, "in the way");

    const store = storeIn(occupied)!;
    await expect(store.evict()).resolves.toBeUndefined();
    await expect(store.write(rootA, snapshotFor(rootA))).resolves.toBe(false);
    expect(store.getStats().writeFailures).toBe(1);
    // "unreadable", not "absent": the directory is broken rather than empty, and that is the
    // distinction someone reading the counters needs.
    expect(await store.read(rootA)).toStrictEqual({ ok: false, miss: "unreadable" });
  });
});
