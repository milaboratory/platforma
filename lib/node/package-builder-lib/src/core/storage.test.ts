import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { expect, test } from "vitest";
import {
  FSStorage,
  GcsStorage,
  initByUrl,
  S3Storage,
  s3eConfigFromUrl,
  storageByUrl,
  type RegistryStorage,
} from "./storage";
import { redactUrl } from "./util";

//
// Address parsing
//

test("relative and file: addresses resolve against the base dir", () => {
  const base = path.resolve("some-base");
  expect((storageByUrl("file:./local/path", base) as FSStorage).root).toEqual(
    path.resolve(base, "local/path"),
  );
  expect((storageByUrl("local/path", base) as FSStorage).root).toEqual(
    path.resolve(base, "local/path"),
  );
});

test("s3 url maps to S3Storage", () => {
  const storage = storageByUrl("s3://some-bucket/some/prefix?region=eu-central-1");
  expect(storage).toBeInstanceOf(S3Storage);
  expect((storage as S3Storage).bucket).toEqual("some-bucket");
  expect((storage as S3Storage).root).toEqual("some/prefix");
});

test("gs url maps to GcsStorage", () => {
  const storage = storageByUrl("gs://some-bucket/some/prefix");
  expect(storage).toBeInstanceOf(GcsStorage);
  expect((storage as GcsStorage).bucketName).toEqual("some-bucket");
  expect((storage as GcsStorage).root).toEqual("some/prefix");
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
      region: "us-east-1",
      credentials: { accessKeyId: "key", secretAccessKey: "se/cr+et" },
    },
    bucket: "bucket",
    keyPrefix: "",
  });

  const storage = storageByUrl("s3es://key:secret@s3.example.com/bucket/a/b");
  expect(storage).toBeInstanceOf(S3Storage);
  expect((storage as S3Storage).bucket).toEqual("bucket");
  expect((storage as S3Storage).root).toEqual("a/b");
});

test("unknown protocol is rejected", () => {
  expect(() => storageByUrl("ftp://host/path")).toThrow(/Unknown protocol/);
});

test("redactUrl drops userinfo, query and fragment", () => {
  expect(redactUrl("s3es://key:secret@s3.example.com/bucket/p")).toEqual(
    "s3es://s3.example.com/bucket/p",
  );
  expect(
    redactUrl(new URL("https://user:secret@registry.example/v2/a.json?X-Goog-Signature=abc#f")),
  ).toEqual("https://registry.example/v2/a.json");
  expect(redactUrl("gs://bucket/prefix")).toEqual("gs://bucket/prefix");
  expect(redactUrl("./local/registry")).toEqual("./local/registry");
  // Unparseable (bad port), still must not leak the secret.
  expect(redactUrl("s3es://key:ab/cd@host:bad/bucket?x=1")).toEqual("s3es://host:bad/bucket");
});

//
// Behaviour, shared by every driver
//

async function checkReadWriteListDelete(storage: RegistryStorage) {
  expect(await storage.getFile("some/deep/file.txt")).toBeUndefined();
  expect(await storage.exists("some/deep/file.txt")).toBe(false);
  expect(await storage.listFiles("not_existing_folder")).toEqual([]);

  await storage.putFile("some/deep/file.txt", Buffer.from("test1"));
  expect((await storage.getFile("some/deep/file.txt"))?.toString()).toEqual("test1");
  expect(await storage.exists("some/deep/file.txt")).toBe(true);

  await storage.putFile("some/deep1/file_1.txt", Buffer.from("test1"));
  await storage.putFile("some/deep1/file_2.txt", Readable.from([Buffer.from("streamed")]));
  expect((await storage.getFile("some/deep1/file_2.txt"))?.toString()).toEqual("streamed");

  const listed = await storage.listFiles("some");
  listed.sort();
  expect(listed).toEqual(["deep/file.txt", "deep1/file_1.txt", "deep1/file_2.txt"]);

  await storage.deleteFiles("some/deep/file.txt");
  expect(await storage.getFile("some/deep/file.txt")).toBeUndefined();
  await storage.deleteFiles("some/deep1/file_1.txt", "some/deep1/file_2.txt");
  expect(await storage.listFiles("some")).toEqual([]);
}

test("local fs storage", async () => {
  const storagePath = path.resolve("tmp", randomUUID());
  try {
    await checkReadWriteListDelete(storageByUrl("file://" + storagePath));
  } finally {
    await fs.promises.rm(storagePath, { recursive: true, force: true });
  }
});

// Real-bucket tests, e.g. TEST_S3_ADDRESS=s3://<bucket>/tests?region=<name> pnpm test
const testS3Address = process.env.TEST_S3_ADDRESS;
test.skipIf(!testS3Address)("s3 storage", async () => {
  const url = new URL(testS3Address!);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/${randomUUID()}`;
  const storage = await initByUrl(url.toString(), ".");
  expect(storage).toBeInstanceOf(S3Storage);
  await checkReadWriteListDelete(storage);
});

// With Application Default Credentials, e.g. TEST_GCS_ADDRESS=gs://<bucket>/tests pnpm test
const testGcsAddress = process.env.TEST_GCS_ADDRESS;
test.skipIf(!testGcsAddress)("gcs storage", async () => {
  const url = new URL(testGcsAddress!);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/${randomUUID()}`;
  const storage = await initByUrl(url.toString(), ".");
  expect(storage).toBeInstanceOf(GcsStorage);
  await checkReadWriteListDelete(storage);
  // A missing object is not an error, same as S3 DeleteObjects.
  await storage.deleteFiles("some/never-existed.txt");

  // Large streamed upload goes through the resumable path.
  await storage.putFile("pkg/stream.tgz", Readable.from([Buffer.alloc(1024 * 1024, 7)]));
  expect((await storage.getFile("pkg/stream.tgz"))?.length).toEqual(1024 * 1024);
  const [meta] = await (
    await (storage as GcsStorage).bucket()
  )
    .file(`${(storage as GcsStorage).root}/pkg/stream.tgz`)
    .getMetadata();
  expect(meta.cacheControl).toEqual("no-cache");
  await storage.deleteFiles("pkg/stream.tgz");
});

test("invalid storage URL error does not carry the address", () => {
  let error: unknown;
  try {
    storageByUrl("s3es://key:ab/cd@host:bad/bucket");
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(Error);
  expect(JSON.stringify(error) + String(error)).not.toContain("ab/cd");
  expect(String(error)).toContain("s3es:");
});

test("s3e URL without a bucket is rejected", () => {
  expect(() => storageByUrl("s3e://minio:9000")).toThrow(/no bucket/);
});

test("package uploads refuse local and scheme-less addresses", async () => {
  await expect(initByUrl("milab-registry/path", ".")).rejects.toThrow(/not supported/);
  await expect(initByUrl("file:./registry", ".")).rejects.toThrow(/not supported/);
});
