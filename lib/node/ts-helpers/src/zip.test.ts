import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { crc32 } from "node:zlib";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { extractZip } from "./zip";

/** `mode` is a Unix mode; `dosAttributes` makes a DOS-made entry with these raw attributes instead. */
type ZipEntrySpec = { name: string; mode: number; content?: string; dosAttributes?: number };

const symlink = 0o120000;
const regular = 0o100000;
const directory = 0o040000;
const dosDate = ((2020 - 1980) << 9) | (1 << 5) | 1;

/** Writes an uncompressed zip by hand, so that tests can hold names that zip writers refuse. */
function buildZip(entries: ZipEntrySpec[]): Buffer {
  const files = entries.map((entry) => {
    const name = Buffer.from(entry.name);
    const data = Buffer.from(entry.content ?? "");
    const common = Buffer.alloc(26);
    common.writeUInt16LE(20, 0);
    common.writeUInt16LE(0x0800, 2);
    common.writeUInt16LE(0, 4);
    common.writeUInt16LE(0, 6);
    common.writeUInt16LE(dosDate, 8);
    common.writeUInt32LE(crc32(data), 10);
    common.writeUInt32LE(data.length, 14);
    common.writeUInt32LE(data.length, 18);
    common.writeUInt16LE(name.length, 22);
    common.writeUInt16LE(0, 24);
    return { entry, name, data, common };
  });

  const locals = files.map(({ name, data, common }) =>
    Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), common, name, data]),
  );
  const offsets = locals.map((_, index) =>
    locals.slice(0, index).reduce((sum, local) => sum + local.length, 0),
  );
  const centrals = files.map(({ entry, name, common }, index) => {
    const tail = Buffer.alloc(12);
    tail.writeUInt32LE(entry.dosAttributes ?? entry.mode * 0x10000, 4);
    tail.writeUInt32LE(offsets[index], 8);
    return Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x01, 0x02, 20, entry.dosAttributes === undefined ? 3 : 0]),
      common.subarray(0, 26),
      Buffer.alloc(2),
      tail,
      name,
    ]);
  });

  const localSize = locals.reduce((sum, local) => sum + local.length, 0);
  const centralSize = centrals.reduce((sum, central) => sum + central.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(localSize, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

describe("extractZip", () => {
  let workDir: string;
  let archive: string;
  let target: string;

  beforeEach(async () => {
    workDir = await fsp.mkdtemp(path.join(os.tmpdir(), "extract-zip-"));
    archive = path.join(workDir, "archive.zip");
    target = path.join(workDir, "target");
  });

  afterEach(async () => {
    await fsp.rm(workDir, { recursive: true, force: true });
  });

  const extract = async (entries: ZipEntrySpec[]) => {
    await fsp.writeFile(archive, buildZip(entries));
    await extractZip(archive, target);
  };

  const workDirEntries = async () => (await fsp.readdir(workDir)).toSorted();

  test("extracts files, folders, modes and inner symlinks", async () => {
    await extract([
      { name: "bin/", mode: directory | 0o755 },
      { name: "bin/tool", mode: regular | 0o755, content: "#!/bin/sh\n" },
      { name: "lib/data.txt", mode: regular | 0o644, content: "data" },
      { name: "lib/alias.txt", mode: symlink | 0o777, content: "data.txt" },
      { name: "plain.txt", mode: 0, content: "plain" },
    ]);

    expect(await fsp.readFile(path.join(target, "bin/tool"), "utf8")).toBe("#!/bin/sh\n");
    expect((await fsp.stat(path.join(target, "bin/tool"))).mode & 0o100).toBe(0o100);
    expect((await fsp.stat(path.join(target, "lib/data.txt"))).mode & 0o111).toBe(0);
    expect(await fsp.readlink(path.join(target, "lib/alias.txt"))).toBe("data.txt");
    expect(await fsp.readFile(path.join(target, "lib/alias.txt"), "utf8")).toBe("data");
    expect(await fsp.readFile(path.join(target, "plain.txt"), "utf8")).toBe("plain");
  });

  test("treats an entry with a directory mode as a folder", async () => {
    await extract([
      { name: "dir", mode: directory | 0o755 },
      { name: "dir/file.txt", mode: regular | 0o644, content: "file" },
    ]);
    expect(await fsp.readFile(path.join(target, "dir/file.txt"), "utf8")).toBe("file");
  });

  test("treats a DOS folder entry without a trailing slash as a folder", async () => {
    await extract([
      { name: "dir", mode: 0, dosAttributes: 0x10 },
      { name: "dir/file.txt", mode: 0, dosAttributes: 0x20, content: "file" },
    ]);
    expect(await fsp.readFile(path.join(target, "dir/file.txt"), "utf8")).toBe("file");
  });

  test("drops setuid, setgid and sticky bits", async () => {
    await extract([{ name: "tool", mode: regular | 0o7755, content: "x" }]);
    expect((await fsp.stat(path.join(target, "tool"))).mode & 0o7000).toBe(0);
  });

  test("stops on an aborted signal", async () => {
    await fsp.writeFile(
      archive,
      buildZip([{ name: "a.txt", mode: regular | 0o644, content: "a" }]),
    );
    await expect(extractZip(archive, target, AbortSignal.abort())).rejects.toThrow();
    expect(await fsp.readdir(target)).toEqual([]);
  });

  test("throws the abort reason when the signal aborts during a file write", async () => {
    await fsp.writeFile(
      archive,
      buildZip([{ name: "big.bin", mode: regular | 0o644, content: "x".repeat(1 << 20) }]),
    );
    const controller = new AbortController();
    const reason = new Error("stop");
    const createWriteStream = fs.createWriteStream;
    const spy = vi.spyOn(fs, "createWriteStream").mockImplementationOnce((...args) => {
      const stream = createWriteStream(...args);
      controller.abort(reason);
      return stream;
    });
    try {
      await expect(extractZip(archive, target, controller.signal)).rejects.toBe(reason);
    } finally {
      spy.mockRestore();
    }
  });

  test("rejects a folder entry on a symlink", async () => {
    await expect(
      extract([
        { name: "link", mode: symlink | 0o777, content: "real" },
        { name: "link/", mode: directory | 0o755 },
      ]),
    ).rejects.toThrow("Zip entry 'link/' goes through a symlink");
  });

  test("rejects a ../ entry", async () => {
    await expect(
      extract([{ name: "../escaped.txt", mode: regular | 0o644, content: "x" }]),
    ).rejects.toThrow();
    expect(await workDirEntries()).toEqual(["archive.zip", "target"]);
  });

  test("rejects a symlink that points outside the target folder", async () => {
    await expect(
      extract([{ name: "link", mode: symlink | 0o777, content: "../" }]),
    ).rejects.toThrow("links outside");
    expect(await fsp.readdir(target)).toEqual([]);
  });

  test("rejects an absolute symlink", async () => {
    await expect(
      extract([{ name: "link", mode: symlink | 0o777, content: workDir }]),
    ).rejects.toThrow("links outside");
    expect(await fsp.readdir(target)).toEqual([]);
  });

  test("rejects a symlink entry with an oversized target", async () => {
    await expect(
      extract([{ name: "link", mode: symlink | 0o777, content: "a".repeat(4097) }]),
    ).rejects.toThrow("too long");
  });

  test("rejects a write through a symlink", async () => {
    await expect(
      extract([
        { name: "self", mode: symlink | 0o777, content: "." },
        { name: "self/up", mode: symlink | 0o777, content: ".." },
        { name: "self/up/escaped.txt", mode: regular | 0o644, content: "x" },
      ]),
    ).rejects.toThrow("goes through a symlink");
    expect(await workDirEntries()).toEqual(["archive.zip", "target"]);
    expect(await fsp.readdir(target)).toEqual(["self"]);
  });

  test("stores a symlink target without inner ../ segments", async () => {
    await extract([
      { name: "link", mode: symlink | 0o777, content: "x/.." },
      { name: "x", mode: symlink | 0o777, content: "." },
    ]);
    expect(await fsp.readlink(path.join(target, "link"))).toBe(".");
    expect(await fsp.realpath(path.join(target, "link"))).toBe(await fsp.realpath(target));
  });
});
