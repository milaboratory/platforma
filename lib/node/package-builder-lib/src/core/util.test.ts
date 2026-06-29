import { hashDirSync } from "./util";
import { test, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const digest = (root: string): string => hashDirSync(root).digest("hex");

// Nested entries must hash under their full path from the root, otherwise distinct trees collide
// and content-addressable dev naming would serve a stale artifact.
test("hashDirSync distinguishes a nested file from a same-named root file", () => {
  const a = fs.mkdtempSync(path.join(os.tmpdir(), "hash-a-"));
  const b = fs.mkdtempSync(path.join(os.tmpdir(), "hash-b-"));
  try {
    // Tree A: an empty `dir/` plus a root `file`.
    fs.mkdirSync(path.join(a, "dir"));
    fs.writeFileSync(path.join(a, "file"), "x");

    // Tree B: the same `file` (same contents) but nested inside `dir/`.
    fs.mkdirSync(path.join(b, "dir"));
    fs.writeFileSync(path.join(b, "dir", "file"), "x");

    expect(digest(a)).not.toEqual(digest(b));
  } finally {
    fs.rmSync(a, { recursive: true, force: true });
    fs.rmSync(b, { recursive: true, force: true });
  }
});

test("hashDirSync is identical for identical trees at different locations", () => {
  const a = fs.mkdtempSync(path.join(os.tmpdir(), "hash-a-"));
  const b = fs.mkdtempSync(path.join(os.tmpdir(), "hash-b-"));
  try {
    for (const root of [a, b]) {
      fs.mkdirSync(path.join(root, "dir"));
      fs.writeFileSync(path.join(root, "dir", "nested"), "hello");
      fs.writeFileSync(path.join(root, "top"), "world");
    }
    expect(digest(a)).toEqual(digest(b));
  } finally {
    fs.rmSync(a, { recursive: true, force: true });
    fs.rmSync(b, { recursive: true, force: true });
  }
});
