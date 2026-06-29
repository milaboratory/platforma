import { ConsoleLoggerAdapter, HmacSha256Signer } from "@milaboratories/ts-helpers";
import * as os from "node:os";
import { createHash } from "node:crypto";
import { text } from "node:stream/consumers";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as zlib from "node:zlib";
import * as tar from "tar-fs";
import { Agent } from "undici";
import { DownloadUrlDriver } from "./driver";
import { test, expect } from "vitest";

function genSigner() {
  return new HmacSha256Signer(HmacSha256Signer.generateSecret());
}

/** Packs a tiny UI folder into a real gzipped `ui.tgz` at `tgzPath`. */
async function makeUiTgz(tgzPath: string): Promise<void> {
  const srcDir = await fsp.mkdtemp(path.join(os.tmpdir(), "ui-src-"));
  await fsp.writeFile(path.join(srcDir, "index.html"), "<html>hello local tgz</html>");
  await fsp.writeFile(path.join(srcDir, "index.js"), "'use strict'; console.log('ui');");
  await pipeline(tar.pack(srcDir), zlib.createGzip(), fs.createWriteStream(tgzPath));
}

test("getLocalTgz unpacks a local ui.tgz, serves a signed path, and caches by path:mtime", async () => {
  const logger = new ConsoleLoggerAdapter();
  const saveDir = await fsp.mkdtemp(path.join(os.tmpdir(), "local-tgz-save-"));
  const tgzPath = path.join(await fsp.mkdtemp(path.join(os.tmpdir(), "local-tgz-src-")), "ui.tgz");
  await makeUiTgz(tgzPath);

  // local-tgz never touches the network; a bare dispatcher is enough.
  const driver = new DownloadUrlDriver(logger, new Agent(), saveDir, genSigner());
  const mtime = "1782150933623";

  const c = driver.getLocalTgz(tgzPath, mtime);

  const first = await c.getValue();
  expect(first).toBeUndefined();

  await c.awaitChange();

  const result = await c.getValue();
  expect(result?.error).toBeUndefined();
  expect(result?.url).not.toBeUndefined();

  // The served URL resolves to the unpacked index.html.
  const u = new URL(result!.url!);
  u.pathname = "index.html";
  const indexPath = driver.getPathForBlockUI(u.toString());
  const html = await text(Readable.toWeb(fs.createReadStream(indexPath)));
  expect(html).toContain("hello local tgz");

  // Cache key is sha256(path + ":" + mtime) — the extraction dir lives there.
  const expectedDir = path.join(
    saveDir,
    createHash("sha256").update(`${tgzPath}:${mtime}`).digest("hex"),
  );
  expect(fs.existsSync(expectedDir)).toBe(true);

  // A second call (same path:mtime) is a cache hit — same served folder, no
  // re-unpack, refcount still held by the first computable.
  const c2 = driver.getLocalTgz(tgzPath, mtime);
  let hit = await c2.getValue();
  if (hit === undefined) {
    await c2.awaitChange();
    hit = await c2.getValue();
  }
  expect(hit?.url).toBe(result!.url);

  c.resetState();
  c2.resetState();
  await driver.releaseAll();
});

test("getLocalTgz re-derives the extraction dir when mtime changes", async () => {
  const logger = new ConsoleLoggerAdapter();
  const saveDir = await fsp.mkdtemp(path.join(os.tmpdir(), "local-tgz-save2-"));
  const tgzPath = path.join(await fsp.mkdtemp(path.join(os.tmpdir(), "local-tgz-src2-")), "ui.tgz");
  await makeUiTgz(tgzPath);

  const driver = new DownloadUrlDriver(logger, new Agent(), saveDir, genSigner());

  const dirFor = (mtime: string) =>
    path.join(saveDir, createHash("sha256").update(`${tgzPath}:${mtime}`).digest("hex"));

  const cA = driver.getLocalTgz(tgzPath, "1");
  expect(await cA.getValue()).toBeUndefined();
  await cA.awaitChange();
  expect((await cA.getValue())?.url).not.toBeUndefined();

  const cB = driver.getLocalTgz(tgzPath, "2");
  expect(await cB.getValue()).toBeUndefined();
  await cB.awaitChange();
  expect((await cB.getValue())?.url).not.toBeUndefined();

  expect(dirFor("1")).not.toBe(dirFor("2"));
  expect(fs.existsSync(dirFor("1"))).toBe(true);
  expect(fs.existsSync(dirFor("2"))).toBe(true);

  cA.resetState();
  cB.resetState();
  await driver.releaseAll();
});
