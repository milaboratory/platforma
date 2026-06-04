// In-memory FileSystem round-trip.
//
// Covers read/write, exists for files and synthesised directories,
// recursive listing, move (file + directory), and recursive delete.

import { describe, test, expect } from "vitest";
import { MemoryFileSystem } from "../fs/memory";

describe("MemoryFileSystem", () => {
  test("write + read + exists", async () => {
    const fs = new MemoryFileSystem();
    expect(fs.exists("a.json")).toBe(false);
    fs.write("a.json", "{}");
    expect(fs.read("a.json")).toBe("{}");
    expect(fs.exists("a.json")).toBe(true);
  });

  test("directory exists when a child file is present", async () => {
    const fs = new MemoryFileSystem({ "model/package.json": "{}" });
    expect(fs.exists("model")).toBe(true);
    expect(fs.exists("model/")).toBe(true);
    expect(fs.exists("ui")).toBe(false);
  });

  test("list recurses", async () => {
    const fs = new MemoryFileSystem({
      "a.txt": "1",
      "b/c.txt": "2",
      "b/d/e.txt": "3",
    });
    expect(fs.list("")).toEqual(["a.txt", "b/c.txt", "b/d/e.txt"]);
    expect(fs.list("b")).toEqual(["b/c.txt", "b/d/e.txt"]);
    expect(fs.list("missing")).toEqual([]);
  });

  test("move renames directory subtrees", async () => {
    const fs = new MemoryFileSystem({
      "test/a.ts": "x",
      "test/b/c.ts": "y",
      "keep.txt": "z",
    });
    fs.move("test", "test-legacy");
    expect(fs.exists("test")).toBe(false);
    expect(fs.read("test-legacy/a.ts")).toBe("x");
    expect(fs.read("test-legacy/b/c.ts")).toBe("y");
    expect(fs.read("keep.txt")).toBe("z");
  });

  test("delete is recursive and idempotent", async () => {
    const fs = new MemoryFileSystem({
      "x/y.ts": "1",
      "x/z.ts": "2",
    });
    fs.delete("x");
    expect(fs.exists("x")).toBe(false);
    fs.delete("x"); // no-op
    expect(fs.exists("x")).toBe(false);
  });
});
