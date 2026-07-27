import { describe, expect, test } from "vitest";
import type { ImportFileHandle, LsEntry } from "./ls";
import { collectListFiles } from "./ls";

/**
 * One folder per sample, each holding an R1/R2 pair — the layout `depth` exists
 * for. `run/deep/nested.fastq.gz` sits one level further down, to pin what the
 * depth bound actually cuts off.
 */
const tree: Record<string, string[]> = {
  run: ["run/A/", "run/B/", "run/deep/", "run/notes.txt"],
  "run/A/": ["run/A/R1.fastq.gz", "run/A/R2.fastq.gz"],
  "run/B/": ["run/B/R1.fastq.gz", "run/B/R2.fastq.gz"],
  "run/deep/": ["run/deep/inner/"],
  "run/deep/inner/": ["run/deep/inner/nested.fastq.gz"],
};

const entryOf = (fullPath: string): LsEntry =>
  fullPath.endsWith("/")
    ? { type: "dir", name: fullPath.slice(0, -1).split("/").pop()!, fullPath }
    : {
        type: "file",
        name: fullPath.split("/").pop()!,
        fullPath,
        handle: `upload://upload/${fullPath}` as ImportFileHandle,
      };

/** Records which directories were actually visited, to pin the walk's cost. */
function lister(visited: string[] = [], unreadable: string[] = []) {
  return {
    visited,
    listDir: async (dirPath: string): Promise<LsEntry[]> => {
      visited.push(dirPath);
      if (unreadable.includes(dirPath)) throw new Error(`EACCES: ${dirPath}`);
      const children = tree[dirPath];
      if (children === undefined) throw new Error(`ENOENT: ${dirPath}`);
      return children.map(entryOf);
    },
  };
}

const paths = (entries: LsEntry[], type: "dir" | "file") =>
  entries
    .filter((e) => e.type === type)
    .map((e) => e.fullPath)
    .sort();

describe("collectListFiles", () => {
  test("depth 1 lists one directory and visits nothing else", async () => {
    const { listDir, visited } = lister();
    const result = await collectListFiles("run", listDir);

    expect(paths(result.entries, "file")).toEqual(["run/notes.txt"]);
    expect(paths(result.entries, "dir")).toEqual(["run/A/", "run/B/", "run/deep/"]);
    expect(visited).toEqual(["run"]);
    expect(result.truncated).toBeUndefined();
    expect(result.unreadableDirs).toBeUndefined();
  });

  test("an absent depth behaves exactly like depth 1", async () => {
    const { listDir } = lister();
    expect(await collectListFiles("run", listDir)).toEqual(
      await collectListFiles("run", lister().listDir, { depth: 1 }),
    );
  });

  test("depth 2 pulls up the files of the sibling folders", async () => {
    const { listDir } = lister();
    const result = await collectListFiles("run", listDir, { depth: 2 });

    expect(paths(result.entries, "file")).toEqual([
      "run/A/R1.fastq.gz",
      "run/A/R2.fastq.gz",
      "run/B/R1.fastq.gz",
      "run/B/R2.fastq.gz",
      "run/notes.txt",
    ]);
    // Only the browsed level's directories are listed: run/deep/inner sits a
    // level below and is not something the user could act on here.
    expect(paths(result.entries, "dir")).toEqual(["run/A/", "run/B/", "run/deep/"]);
  });

  test("depth 3 reaches the level depth 2 cut off", async () => {
    const { listDir } = lister();
    const result = await collectListFiles("run", listDir, { depth: 3 });

    expect(paths(result.entries, "file")).toContain("run/deep/inner/nested.fastq.gz");
    expect(paths(result.entries, "dir")).toEqual(["run/A/", "run/B/", "run/deep/"]);
  });

  test("reaching the requested depth is not truncation", async () => {
    const { listDir } = lister();
    // run/deep/inner is left unread, but that bound was asked for.
    expect((await collectListFiles("run", listDir, { depth: 2 })).truncated).toBeUndefined();
  });

  test("the entry cap is reported, and keeps the shallowest entries", async () => {
    const { listDir } = lister();
    const result = await collectListFiles("run", listDir, { depth: 3, limit: 4 });

    expect(result.entries).toHaveLength(4);
    expect(result.truncated).toBe(true);
    // Breadth-first: level 0 lands before anything deeper.
    expect(result.entries.slice(0, 4).map((e) => e.fullPath)).toEqual([
      "run/A/",
      "run/B/",
      "run/deep/",
      "run/notes.txt",
    ]);
  });

  test("an unreadable directory is counted and stepped over", async () => {
    const { listDir } = lister([], ["run/B/"]);
    const result = await collectListFiles("run", listDir, { depth: 2 });

    expect(result.unreadableDirs).toBe(1);
    expect(paths(result.entries, "file")).toEqual([
      "run/A/R1.fastq.gz",
      "run/A/R2.fastq.gz",
      "run/notes.txt",
    ]);
  });

  test("an unreadable root yields nothing rather than throwing", async () => {
    const { listDir } = lister([], ["run"]);
    const result = await collectListFiles("run", listDir, { depth: 2 });

    expect(result.entries).toEqual([]);
    expect(result.unreadableDirs).toBe(1);
  });

  test("depth 1 lets the caller see a failure to list the root", async () => {
    const { listDir } = lister([], ["run"]);
    await expect(collectListFiles("run", listDir)).rejects.toThrow("EACCES");
  });

  test("nonsense depth and limit values are clamped, not trusted", async () => {
    const { listDir, visited } = lister();
    const zeroDepth = await collectListFiles("run", listDir, { depth: 0 });
    expect(visited).toEqual(["run"]);
    expect(zeroDepth.entries).toHaveLength(4);

    const fractional = await collectListFiles("run", lister().listDir, { depth: 2.7, limit: 0.5 });
    expect(fractional.entries).toHaveLength(1);
    expect(fractional.truncated).toBe(true);
  });
});
