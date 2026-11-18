import { describe, expect, test } from "vitest";
import type {
  ImportFileHandle,
  ListFilesResult,
  LsEntry,
  StorageHandle,
} from "@platforma-sdk/model";
import { createLimiter, expandRemoteFolders, type ListFiles } from "./remote-folder-walk";

const storage: StorageHandle = "remote://test";

const handleOf = (path: string): ImportFileHandle => `index://index/${encodeURIComponent(path)}`;

/** An in-memory storage: every key is a full file path, folders are implied. */
function fakeStorage(paths: string[]) {
  const calls: string[] = [];
  let inFlight = 0;
  let peak = 0;
  const listFiles: ListFiles = async (_storage, dir): Promise<ListFilesResult> => {
    calls.push(dir);
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 1));
    inFlight--;
    const prefix = dir.endsWith("/") ? dir : dir + "/";
    const children = new Map<string, LsEntry>();
    for (const p of paths) {
      if (!p.startsWith(prefix)) continue;
      const [name, ...rest] = p.slice(prefix.length).split("/");
      const fullPath = prefix + name;
      children.set(
        name,
        rest.length > 0
          ? { type: "dir", name, fullPath }
          : { type: "file", name, fullPath, handle: handleOf(fullPath) },
      );
    }
    return { entries: [...children.values()] };
  };
  return { listFiles, calls, peak: () => peak };
}

const plates = [
  "data/plate-1/A01/forward/IGH.ab1",
  "data/plate-1/A01/reverse/IGH.ab1",
  "data/plate-1/A02/forward/IGH.ab1",
  "data/plate-1/.DS_Store",
  "data/plate-1/A01/forward/notes.txt",
  "data/plate-1/__MACOSX/A01/._IGH.ab1",
  "data/plate-3/A01/forward/IGH.ab1",
  "data/empty-plate/readme.md",
];

const paths = (handles: ImportFileHandle[]) =>
  handles.map((h) => decodeURIComponent(h.slice("index://index/".length)));

describe("expandRemoteFolders", () => {
  test("walks every level, keeps folder order, sorts files by path", async () => {
    const { listFiles } = fakeStorage(plates);
    const result = await expandRemoteFolders(listFiles, storage, ["data/plate-3", "data/plate-1"], {
      extensions: [".ab1"],
    });
    expect(paths(result.handles)).toEqual([
      "data/plate-3/A01/forward/IGH.ab1",
      "data/plate-1/A01/forward/IGH.ab1",
      "data/plate-1/A01/reverse/IGH.ab1",
      "data/plate-1/A02/forward/IGH.ab1",
    ]);
    expect(result.emptyFolders).toEqual([]);
  });

  test("skips hidden entries and __MACOSX without listing them", async () => {
    const { listFiles, calls } = fakeStorage(plates);
    await expandRemoteFolders(listFiles, storage, ["data/plate-1"], { extensions: undefined });
    expect(calls.some((c) => c.includes("__MACOSX"))).toBe(false);
  });

  test("reports folders that yield nothing to import", async () => {
    const { listFiles } = fakeStorage(plates);
    const result = await expandRemoteFolders(
      listFiles,
      storage,
      ["data/plate-3", "data/empty-plate"],
      { extensions: [".ab1"] },
    );
    expect(result.emptyFolders).toEqual(["data/empty-plate"]);
  });

  test("reports progress and keeps calls within the concurrency limit", async () => {
    const wells = Array.from({ length: 40 }, (_, i) => `p/W${i}/forward/IGH.ab1`);
    const storageFake = fakeStorage(wells);
    const seen: number[] = [];
    const result = await expandRemoteFolders(storageFake.listFiles, storage, ["p"], {
      extensions: undefined,
      concurrency: 3,
      onProgress: (p) => seen.push(p.filesFound),
    });
    expect(result.handles).toHaveLength(40);
    expect(storageFake.peak()).toBeLessThanOrEqual(3);
    expect(seen.at(-1)).toBe(40);
  });

  test("walks sharing one limiter stay within it together", async () => {
    const wells = Array.from({ length: 20 }, (_, i) => `p${i % 2}/W${i}/forward/IGH.ab1`);
    const storageFake = fakeStorage(wells);
    const limit = createLimiter(3);
    const [a, b] = await Promise.all(
      ["p0", "p1"].map((folder) =>
        expandRemoteFolders(storageFake.listFiles, storage, [folder], {
          extensions: undefined,
          limit,
        }),
      ),
    );
    expect(a.handles).toHaveLength(10);
    expect(b.handles).toHaveLength(10);
    expect(storageFake.peak()).toBeLessThanOrEqual(3);
  });

  test("stops on abort", async () => {
    const { listFiles } = fakeStorage(plates);
    const controller = new AbortController();
    const run = expandRemoteFolders(listFiles, storage, ["data/plate-1"], {
      extensions: undefined,
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });
    await expect(run).rejects.toThrow();
  });

  test("a listing error rejects", async () => {
    const failing: ListFiles = async () => {
      throw new Error("storage unavailable");
    };
    await expect(
      expandRemoteFolders(failing, storage, ["x"], { extensions: undefined }),
    ).rejects.toThrow("storage unavailable");
  });
});
