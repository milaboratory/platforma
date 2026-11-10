import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { S3 } from "@aws-sdk/client-s3";
import { afterEach, expect, test, vi } from "vitest";
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

// In-memory stand-in for @google-cloud/storage, used unless TEST_GCS_ADDRESS points at a real
// bucket. It records what the driver asks for, so the tests can check options and metadata.
const fakeGcs = vi.hoisted(() => {
  const { Writable } = require("node:stream") as typeof import("node:stream");
  const objects = new Map<string, { data: Buffer; cacheControl?: string }>();
  const calls = {
    storageOptions: [] as unknown[],
    probes: [] as string[],
    failDelete: new Set<string>(),
  };
  const notFound = () => Object.assign(new Error("No such object"), { code: 404 });
  class File {
    constructor(public readonly name: string) {}
    async exists() {
      calls.probes.push(this.name);
      return [objects.has(this.name)];
    }
    async download() {
      const o = objects.get(this.name);
      if (o === undefined) throw notFound();
      return [o.data];
    }
    async save(data: Buffer, opts: { metadata?: { cacheControl?: string } }) {
      objects.set(this.name, { data, cacheControl: opts.metadata?.cacheControl });
    }
    createWriteStream(opts: { metadata?: { cacheControl?: string } }) {
      const chunks: Buffer[] = [];
      return new Writable({
        write: (chunk: Buffer, _enc, cb) => {
          chunks.push(chunk);
          cb();
        },
        final: (cb) => {
          objects.set(this.name, {
            data: Buffer.concat(chunks),
            cacheControl: opts.metadata?.cacheControl,
          });
          cb();
        },
      });
    }
    async delete(opts: { ignoreNotFound?: boolean }) {
      if (calls.failDelete.has(this.name)) throw new Error(`denied: ${this.name}`);
      if (!objects.delete(this.name) && !opts.ignoreNotFound) throw notFound();
    }
  }
  class Bucket {
    file(name: string) {
      return new File(name);
    }
    async getFiles(opts: { prefix: string }) {
      return [
        [...objects.keys()].filter((k) => k.startsWith(opts.prefix)).map((name) => ({ name })),
      ];
    }
  }
  class Storage {
    constructor(options: unknown) {
      calls.storageOptions.push(options);
    }
    bucket() {
      return new Bucket();
    }
  }
  return {
    module: { Storage, IdempotencyStrategy: { RetryAlways: "RetryAlways" } },
    objects,
    calls,
  };
});
vi.mock("@google-cloud/storage", async (importOriginal) =>
  process.env.TEST_GCS_ADDRESS ? await importOriginal() : fakeGcs.module,
);

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

afterEach(() => {
  vi.unstubAllEnvs();
});

test("s3e and s3es URLs: endpoint scheme, credentials, nested prefix", () => {
  vi.stubEnv("AWS_REGION", "");
  const plain = s3eConfigFromUrl(new URL("s3e://s3.local:9000/bucket/a/b?region=eu-west-1"));
  expect(plain).toEqual({
    options: { endpoint: "http://s3.local:9000", forcePathStyle: true, region: "eu-west-1" },
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

test("s3e region: URL first, then AWS_REGION, then us-east-1", () => {
  vi.stubEnv("AWS_REGION", "");
  expect(s3eConfigFromUrl(new URL("s3e://s3.local:9000/b")).options.region).toEqual("us-east-1");
  vi.stubEnv("AWS_REGION", "eu-north-1");
  expect(s3eConfigFromUrl(new URL("s3e://s3.local:9000/b")).options.region).toEqual("eu-north-1");
  expect(
    s3eConfigFromUrl(new URL("s3e://s3.local:9000/b?region=ap-south-1")).options.region,
  ).toEqual("ap-south-1");
});

test("s3 and gs URLs without a bucket are rejected", () => {
  expect(() => storageByUrl("gs:///prefix")).toThrow(/no bucket/);
  expect(() => storageByUrl("s3:///prefix")).toThrow(/no bucket/);
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

async function checkReadWriteListDelete(storage: Required<RegistryStorage>) {
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

  // A missing object is not an error on any driver, same as S3 DeleteObjects.
  await storage.deleteFiles("some/never-existed.txt");
  await storage.deleteFiles();
}

test("local fs storage", async () => {
  const storagePath = path.resolve("tmp", randomUUID());
  try {
    const storage = storageByUrl("file://" + storagePath);
    expect(storage).toBeInstanceOf(FSStorage);
    await checkReadWriteListDelete(storage as FSStorage);
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
  await checkReadWriteListDelete(storage as S3Storage);
});

// With Application Default Credentials, e.g. TEST_GCS_ADDRESS=gs://<bucket>/tests pnpm test
const testGcsAddress = process.env.TEST_GCS_ADDRESS;
test.skipIf(!testGcsAddress)("gcs storage", async () => {
  const url = new URL(testGcsAddress!);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/${randomUUID()}`;
  const storage = await initByUrl(url.toString(), ".");
  expect(storage).toBeInstanceOf(GcsStorage);
  await checkReadWriteListDelete(storage as GcsStorage);

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
  expect(() => storageByUrl("s3e://s3.local:9000")).toThrow(/no bucket/);
});

test("package uploads refuse local and scheme-less addresses", async () => {
  await expect(initByUrl("milab-registry/path", ".")).rejects.toThrow(/not supported/);
  await expect(initByUrl("file:./registry", ".")).rejects.toThrow(/not supported/);
});

test.skipIf(!!testGcsAddress)("gcs storage against an in-memory client", async () => {
  fakeGcs.objects.clear();
  const storage = storageByUrl("gs://fake-bucket/reg/root");
  expect(storage).toBeInstanceOf(GcsStorage);
  const gcs = storage as GcsStorage;
  await checkReadWriteListDelete(gcs);

  // Retries are on for writes and deletes.
  expect(fakeGcs.calls.storageOptions).toContainEqual({
    retryOptions: { idempotencyStrategy: "RetryAlways" },
  });

  // Keys sit under the root; listing is relative to the prefix; both put paths set no-cache.
  await gcs.putFile("v2/a.json", Buffer.from("a"));
  await gcs.putFile("v2/b/c.tgz", Readable.from([Buffer.from("c")]));
  expect([...fakeGcs.objects.keys()].sort()).toEqual(["reg/root/v2/a.json", "reg/root/v2/b/c.tgz"]);
  expect((await gcs.listFiles("v2/")).sort()).toEqual(["a.json", "b/c.tgz"]);
  expect([...fakeGcs.objects.values()].map((o) => o.cacheControl)).toEqual([
    "no-cache",
    "no-cache",
  ]);

  // The access probe stays inside the prefix.
  await gcs.checkAccess();
  expect(fakeGcs.calls.probes).toContain("reg/root/.access-check");

  // Delete failures are collected, not stopped at the first one.
  const many = Array.from({ length: 40 }, (_, i) => `bulk/${i}`);
  for (const f of many) await gcs.putFile(f, Buffer.from("x"));
  fakeGcs.calls.failDelete.add("reg/root/bulk/3").add("reg/root/bulk/33");
  await expect(gcs.deleteFiles(...many)).rejects.toThrow(/bulk\/3\n.*bulk\/33/s);
  expect(await gcs.listFiles("bulk/")).toEqual(["3", "33"]);
});

test("s3 deletes go in batches of 1000 and collect errors", async () => {
  const client = new S3({
    region: "us-east-1",
    credentials: { accessKeyId: "k", secretAccessKey: "s" },
  });
  const batches: number[] = [];
  client.middlewareStack.add(
    () => async (args) => {
      const input = args.input as { Delete: { Objects: { Key: string }[] } };
      batches.push(input.Delete.Objects.length);
      const failed = input.Delete.Objects.filter((o) => o.Key.endsWith("/1500"));
      return {
        output: {
          Errors: failed.map((o) => ({ Key: o.Key, Message: `denied ${o.Key}` })),
          $metadata: {},
        },
        response: {},
      };
    },
    { step: "initialize", name: "fakeDeleteObjects" },
  );
  const storage = new S3Storage(client, "bucket", "root");
  await storage.deleteFiles();
  expect(batches).toEqual([]);
  await expect(
    storage.deleteFiles(...Array.from({ length: 2500 }, (_, i) => `f/${i}`)),
  ).rejects.toThrow("denied root/f/1500");
  expect(batches).toEqual([1000, 1000, 500]);
});
