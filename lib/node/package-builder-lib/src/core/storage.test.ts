import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { expect, test } from "vitest";
import { GcsStorage, initByUrl, s3eConfigFromUrl } from "./storage";
import { redactUrl } from "./util";

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

test("s3e and s3es URLs: endpoint scheme, credentials, nested prefix", () => {
  const plain = s3eConfigFromUrl(new URL("s3e://minio:9000/bucket/a/b?region=eu-west-1"));
  expect(plain).toEqual({
    options: { endpoint: "http://minio:9000", forcePathStyle: true, region: "eu-west-1" },
    bucket: "bucket",
    keyPrefix: "a/b",
  });

  const secure = s3eConfigFromUrl(new URL("s3es://key:se%2Fcr%2Bet@s3.example.com/bucket"));
  expect(secure).toEqual({
    options: {
      endpoint: "https://s3.example.com",
      forcePathStyle: true,
      credentials: { accessKeyId: "key", secretAccessKey: "se/cr+et" },
    },
    bucket: "bucket",
    keyPrefix: "",
  });
});

test("redactUrl masks the password and leaves other addresses alone", () => {
  expect(redactUrl("s3es://key:secret@s3.example.com/bucket/p")).toEqual(
    "s3es://key:***@s3.example.com/bucket/p",
  );
  expect(redactUrl("s3://bucket/prefix?region=eu-west-1")).toEqual(
    "s3://bucket/prefix?region=eu-west-1",
  );
  expect(redactUrl("./local/registry")).toEqual("./local/registry");
});
