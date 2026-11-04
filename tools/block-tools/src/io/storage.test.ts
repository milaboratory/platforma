import { randomUUID } from "node:crypto";
import { test, expect } from "vitest";
import { GcsStorage, S3Storage, storageByUrl } from "./storage";
import path from "node:path";
import * as fs from "node:fs";

test("file url test #1", async () => {
  const url = new URL("file:./local/path", "file://" + path.resolve(".") + "/");
  expect(url.pathname).toEqual(path.resolve("./local/path"));
});

test("file url test #2", async () => {
  const url = new URL("http://a/b/c", "file://" + path.resolve(".") + "/");
  expect(url.toString()).toEqual("http://a/b/c");
});

test("test local fs read write", async () => {
  const uuid = randomUUID().toString();
  const tmp = path.resolve("tmp");
  const storagePath = path.resolve(tmp, uuid);
  const storage = storageByUrl("file://" + storagePath);
  expect(await storage.getFile("some/deep/file.txt")).toBeUndefined();
  await storage.putFile("some/deep/file.txt", Buffer.from("test1"));
  expect((await storage.getFile("some/deep/file.txt"))?.toString()).toEqual("test1");
  await fs.promises.rm(storagePath, { recursive: true });
});

test("test local fs list", async () => {
  const uuid = randomUUID().toString();
  const tmp = path.resolve("tmp");
  const storagePath = path.resolve(tmp, uuid);
  const storage = storageByUrl("file://" + storagePath);
  await storage.putFile("some/deep1/file_1.txt", Buffer.from("test1"));
  await storage.putFile("some/deep1/file_2.txt", Buffer.from("test1"));
  await storage.putFile("some/deep2/file_1.txt", Buffer.from("test1"));
  const result = await storage.listFiles("some");
  result.sort();
  const expected = ["deep2/file_1.txt", "deep1/file_1.txt", "deep1/file_2.txt"];
  expected.sort();
  expect(result).toEqual(expected);
  await storage.deleteFiles("some/deep2/file_1.txt");
  expected.splice(expected.indexOf("some/deep2/file_1.txt"), 1);
  const result1 = await storage.listFiles("some");
  result1.sort();
  expect(result1).toEqual(expected);
  await fs.promises.rm(storagePath, { recursive: true });
});

const testS3Address = process.env.TEST_S3_ADDRESS;
if (testS3Address) {
  test("test s3 read write", async () => {
    const uuid = randomUUID().toString();
    const testS3AddressURL = new URL(testS3Address);
    testS3AddressURL.pathname = `${testS3AddressURL.pathname.replace(/\/$/, "")}/${uuid}`;
    const storage = storageByUrl(testS3AddressURL.toString()) as S3Storage;
    expect(await storage.getFile("some/deep/file.txt")).toBeUndefined();
    await storage.putFile("some/deep/file.txt", Buffer.from("test1"));
    expect((await storage.getFile("some/deep/file.txt"))?.toString()).toEqual("test1");
    await storage.deleteFiles(`some/deep/file.txt`);
    expect(await storage.getFile("some/deep/file.txt")).toBeUndefined();
  });

  test("test s3 fs list", async () => {
    const uuid = randomUUID().toString();
    const testS3AddressURL = new URL(testS3Address);
    testS3AddressURL.pathname = `${testS3AddressURL.pathname.replace(/\/$/, "")}/${uuid}`;
    const storage = storageByUrl(testS3AddressURL.toString()) as S3Storage;

    const nonExistingFolderListing = await storage.listFiles("not_existing_folder");
    expect(nonExistingFolderListing).toEqual([]);

    await storage.putFile("some/deep1/file_1.txt", Buffer.from("test1"));
    await storage.putFile("some/deep1/file_2.txt", Buffer.from("test1"));
    await storage.putFile("some/deep2/file_1.txt", Buffer.from("test1"));
    const result = await storage.listFiles("some");
    result.sort();
    const expected = ["deep2/file_1.txt", "deep1/file_1.txt", "deep1/file_2.txt"];
    expected.sort();
    expect(result).toEqual(expected);
    await storage.deleteFiles("some/deep2/file_1.txt");
    expected.splice(expected.indexOf("some/deep2/file_1.txt"), 1);
    const result1 = await storage.listFiles("some");
    result1.sort();
    expect(result1).toEqual(expected);
    await storage.client.deleteObjects({
      Bucket: storage.bucket,
      Delete: {
        Objects: [
          { Key: `${storage.root}/some/deep1/file_1.txt` },
          { Key: `${storage.root}/some/deep1/file_2.txt` },
          { Key: `${storage.root}/some/deep2/file_1.txt` },
        ],
      },
    });
  });
}

test("gs url maps to GcsStorage", () => {
  const storage = storageByUrl("gs://some-bucket/some/prefix");
  expect(storage).toBeInstanceOf(GcsStorage);
  expect((storage as GcsStorage).bucketName).toEqual("some-bucket");
  expect((storage as GcsStorage).root).toEqual("some/prefix");
});

// Runs against a real bucket with Application Default Credentials, e.g.
// TEST_GCS_ADDRESS=gs://<bucket>/tests pnpm test
const testGcsAddress = process.env.TEST_GCS_ADDRESS;
if (testGcsAddress) {
  const gcsStorage = () => {
    const url = new URL(testGcsAddress);
    url.pathname = `${url.pathname.replace(/\/$/, "")}/${randomUUID()}`;
    return storageByUrl(url.toString());
  };

  test("test gcs read write delete", async () => {
    const storage = gcsStorage();
    expect(await storage.getFile("some/deep/file.txt")).toBeUndefined();
    await storage.putFile("some/deep/file.txt", Buffer.from("test1"));
    expect((await storage.getFile("some/deep/file.txt"))?.toString()).toEqual("test1");
    await storage.deleteFiles("some/deep/file.txt", "some/deep/never-existed.txt");
    expect(await storage.getFile("some/deep/file.txt")).toBeUndefined();
  });

  test("test gcs list", async () => {
    const storage = gcsStorage();
    expect(await storage.listFiles("not_existing_folder")).toEqual([]);
    await storage.putFile("some/deep1/file_1.txt", Buffer.from("test1"));
    await storage.putFile("some/deep1/file_2.txt", Buffer.from("test1"));
    await storage.putFile("some/deep2/file_1.txt", Buffer.from("test1"));
    const result = await storage.listFiles("some");
    result.sort();
    expect(result).toEqual(["deep1/file_1.txt", "deep1/file_2.txt", "deep2/file_1.txt"]);
    await storage.deleteFiles(...result.map((f) => `some/${f}`));
    expect(await storage.listFiles("some")).toEqual([]);
  });
}
