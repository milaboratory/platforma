import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { expect, test } from "vitest";
import { GcsStorage, initByUrl } from "./storage";

// Runs against a real bucket with Application Default Credentials, e.g.
// TEST_GCS_ADDRESS=gs://<bucket>/tests pnpm test
const testGcsAddress = process.env.TEST_GCS_ADDRESS;
test.skipIf(!testGcsAddress)("gcs software storage: exists and upload", async () => {
  const root = `${testGcsAddress!.replace(/\/$/, "")}/${randomUUID()}`;
  const storage = await initByUrl(root, ".");
  expect(storage).toBeInstanceOf(GcsStorage);

  expect(await storage.exists("pkg/buffer.tgz")).toBe(false);
  await storage.putFile("pkg/buffer.tgz", Buffer.from("buffer content"));
  expect(await storage.exists("pkg/buffer.tgz")).toBe(true);

  await storage.putFile("pkg/stream.tgz", Readable.from([Buffer.alloc(1024 * 1024, 7)]));
  expect(await storage.exists("pkg/stream.tgz")).toBe(true);

  const bucket = (storage as GcsStorage).bucket;
  const prefix = (storage as GcsStorage).root;
  const [meta] = await bucket.file(`${prefix}/pkg/stream.tgz`).getMetadata();
  expect(Number(meta.size)).toEqual(1024 * 1024);
  await bucket.deleteFiles({ prefix });
});
