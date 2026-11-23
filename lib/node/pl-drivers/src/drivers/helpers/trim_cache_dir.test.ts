import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { MiLogger } from "@milaboratories/ts-helpers";
import { expect, test } from "vitest";
import { trimCacheDir } from "./trim_cache_dir";

const logger: MiLogger = { info: () => {}, warn: () => {}, error: () => {} };

async function makeEntry(
  dir: string,
  name: string,
  bytes: number,
  mtimeSec: number,
  asDir = false,
) {
  const entryPath = path.join(dir, name);
  if (asDir) {
    await fsp.mkdir(entryPath);
    await fsp.writeFile(path.join(entryPath, "data"), Buffer.alloc(bytes));
  } else {
    await fsp.writeFile(entryPath, Buffer.alloc(bytes));
  }
  await fsp.utimes(entryPath, mtimeSec, mtimeSec);
}

test("removes oldest entries until the dir fits the limit", async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "trim-cache-dir-"));
  await makeEntry(dir, "old", 10, 1000);
  await makeEntry(dir, "mid", 10, 2000, true);
  await makeEntry(dir, "new", 10, 3000);

  await trimCacheDir(logger, dir, 20);

  expect((await fsp.readdir(dir)).sort()).toEqual(["mid", "new"]);
});

test("keeps everything when the dir is within the limit", async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "trim-cache-dir-"));
  await makeEntry(dir, "a", 10, 1000);
  await makeEntry(dir, "b", 10, 2000, true);

  await trimCacheDir(logger, dir, 20);

  expect((await fsp.readdir(dir)).sort()).toEqual(["a", "b"]);
});

test("ignores a missing dir", async () => {
  await expect(
    trimCacheDir(logger, path.join(os.tmpdir(), "trim-cache-dir-missing-xyz"), 1),
  ).resolves.toBeUndefined();
});

test("counts a dangling symlink without following it", async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "trim-cache-dir-"));
  const oldDir = path.join(dir, "old");
  await fsp.mkdir(oldDir);
  await fsp.writeFile(path.join(oldDir, "data"), Buffer.alloc(10));
  await fsp.symlink(path.join(dir, "missing-target"), path.join(oldDir, "dangling"));
  await fsp.utimes(oldDir, 1000, 1000);
  await makeEntry(dir, "new", 10, 3000);

  await trimCacheDir(logger, dir, 15);

  expect(await fsp.readdir(dir)).toEqual(["new"]);
});
