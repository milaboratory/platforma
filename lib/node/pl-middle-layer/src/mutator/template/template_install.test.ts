import { createHash } from "node:crypto";
import { HmacSha256Signer } from "@milaboratories/ts-helpers";
import { describe, expect, test } from "vitest";
import { packSha256 } from "../block-pack/block_pack";
import { blobImportExternalData, blobUploadData, templateInstallData } from "./template_cache";

describe("template install resource data", () => {
  const sha256 = "ab".repeat(32);

  test("install carries only the pack sha256", () => {
    expect(JSON.parse(templateInstallData(sha256))).toEqual({ sha256 });
  });

  test("registry import pins the pack version to its sha256", () => {
    const data = blobImportExternalData("https://registry.example/main.plj.gz", sha256);
    expect(JSON.parse(data)).toEqual({
      dataURL: "https://registry.example/main.plj.gz",
      dataVersion: sha256,
    });
  });

  test("local upload is signed with seconds-precision mtime", () => {
    const signer = new HmacSha256Signer("test");
    const data = blobUploadData("/dev/block/main.plj.gz", signer, {
      size: 1234n,
      mtimeMs: 1_700_000_000_999n,
    });
    expect(data).toEqual({
      localPath: "/dev/block/main.plj.gz",
      pathSignature: signer.sign("/dev/block/main.plj.gz"),
      sizeBytes: "1234",
      modificationTime: "1700000000",
    });
  });

  test("dev pack sha256 is lowercase hex of the raw gzipped bytes", () => {
    const content = new Uint8Array([0x1f, 0x8b, 1, 2, 3]);
    expect(packSha256(content)).toBe(createHash("sha256").update(content).digest("hex"));
    expect(packSha256(content)).toMatch(/^[0-9a-f]{64}$/);
  });
});
