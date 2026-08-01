import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { asSignedResourceId } from "@milaboratories/pl-client";
import type { ExtendedResourceData } from "@milaboratories/pl-tree";
import { describe, expect, test } from "vitest";
import { createProjectTreeStore } from "./project_tree_store";

// Signed ids are "<globalId>|<signatureHex>"; these are synthetic but well-formed.
const ROOT = asSignedResourceId("1|aa");
const OTHER_ROOT = asSignedResourceId("2|bb");

function resource(
  id: string,
  typeName: string,
  opts: { final?: boolean; data?: string } = {},
): ExtendedResourceData {
  return {
    id: asSignedResourceId(id),
    kind: "Structural",
    type: { name: typeName, version: "1" },
    originalResourceId: 0n,
    error: 0n,
    resourceReady: true,
    inputsLocked: true,
    outputsLocked: true,
    final: opts.final ?? true,
    fields: [],
    kv: [],
    ...(opts.data === undefined ? {} : { data: Buffer.from(opts.data) }),
  } as unknown as ExtendedResourceData;
}

async function tempStore() {
  const dir = await mkdtemp(path.join(tmpdir(), "tree-store-"));
  return { dir, store: createProjectTreeStore(dir, ROOT) };
}

describe("project tree store", () => {
  test("round-trips a block pack, data included", async () => {
    const { store } = await tempStore();
    await store.save([resource("10|cc", "BlockPackCustom", { data: "bundle-source" })], [ROOT]);

    const loaded = await store.load([ROOT]);
    expect(loaded).toHaveLength(1);
    expect(loaded![0].id).toBe("10|cc");
    expect(loaded![0].data?.toString()).toBe("bundle-source");
  });

  test("stores every final resource, because a partial subgraph cannot be replayed", async () => {
    // The intent was to keep only content-addressed types. That is not possible: `PlTreeState`
    // requires resources reachable from a root, so replaying block packs alone throws
    // `orphan resource` and invalidates the tree. The store therefore has to persist the whole
    // connected tree — which is precisely why it is opt-in and unshipped. See
    // PERSIST_ONLY_TYPES in project_tree_store.ts.
    const { store } = await tempStore();
    await store.save(
      [
        resource("10|cc", "BlockPackCustom", { data: "keep" }),
        resource("11|dd", "ParquetChunk", { final: true, data: "keep" }),
        resource("12|ee", "PFrame", { final: true }),
      ],
      [ROOT],
    );

    const loaded = await store.load([ROOT]);
    expect(new Set(loaded!.map((r) => r.type.name))).toEqual(
      new Set(["BlockPackCustom", "ParquetChunk", "PFrame"]),
    );
  });

  test("never stores a non-final resource", async () => {
    const { store } = await tempStore();
    await store.save([resource("10|cc", "BlockPackCustom", { final: false, data: "x" })], [ROOT]);
    expect(await store.load([ROOT])).toBeUndefined();
  });

  test("refuses a file written for a different root set", async () => {
    const { store } = await tempStore();
    await store.save([resource("10|cc", "BlockPackCustom", { data: "x" })], [ROOT]);
    // A tree whose roots moved is a different tree; replaying would claim resources it may
    // never reach.
    expect(await store.load([OTHER_ROOT])).toBeUndefined();
  });

  test("refuses a file from an older format", async () => {
    const { dir, store } = await tempStore();
    await store.save([resource("10|cc", "BlockPackCustom", { data: "x" })], [ROOT]);
    const [name] = await readdir(dir);
    const file = path.join(dir, name);
    const parsed = JSON.parse(await readFile(file, "utf-8")) as { version: number };
    parsed.version = 999;
    await writeFile(file, JSON.stringify(parsed));

    expect(await store.load([ROOT])).toBeUndefined();
  });

  test("a missing file is not an error", async () => {
    const { store } = await tempStore();
    expect(await store.load([ROOT])).toBeUndefined();
  });
});
