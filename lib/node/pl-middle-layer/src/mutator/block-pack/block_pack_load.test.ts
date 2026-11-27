import { defaultHttpDispatcher } from "@milaboratories/pl-http";
import { HmacSha256Signer } from "@milaboratories/ts-helpers";
import fs from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { V2RegistryProvider } from "../../block_registry/registry-v2-provider";
import { BlockPackPreparer, packSha256 } from "./block_pack";

const newPreparer = () =>
  new BlockPackPreparer(
    new V2RegistryProvider(defaultHttpDispatcher()),
    new HmacSha256Signer(HmacSha256Signer.generateSecret()),
  );

test("loadPack drops a download with the wrong sha256, so the next attempt fetches again", async () => {
  let requests = 0;
  const server = http.createServer((_req, res) => {
    requests++;
    res.end("not the pack");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/main.plj.gz`;
    const preparer = newPreparer();
    const template = { type: "registry-pack" as const, url, sha256: "0".repeat(64) };

    await expect(preparer.loadPack(template)).rejects.toThrow(/expected 0{64}/);
    await expect(preparer.loadPack(template)).rejects.toThrow(/expected 0{64}/);
    expect(requests).toBe(2);
  } finally {
    server.close();
  }
});

test("loadPack refuses a local pack rebuilt after prepare", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pack-"));
  try {
    const packPath = path.join(dir, "main.plj.gz");
    await fs.writeFile(packPath, "build 1");
    const sha256 = packSha256(new TextEncoder().encode("build 1"));
    await fs.writeFile(packPath, "build 2");

    await expect(
      newPreparer().loadPack({ type: "local-pack", path: packPath, sha256 }),
    ).rejects.toThrow(/changed after the block was prepared/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
