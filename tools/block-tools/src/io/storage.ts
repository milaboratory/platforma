import pathPosix from "node:path/posix";
import path from "node:path";
import { paginateListObjectsV2, S3 } from "@aws-sdk/client-s3";
import * as fs from "node:fs";

export interface RegistryStorage {
  putFile(file: string, buffer: Buffer): Promise<void>;

  getFile(file: string): Promise<Buffer | undefined>;

  listFiles(prefix: string): Promise<string[]>;

  deleteFiles(...files: string[]): Promise<void>;
}

export class S3Storage implements RegistryStorage {
  constructor(
    public readonly client: S3,
    public readonly bucket: string,
    public readonly root: string,
  ) {}

  async getFile(file: string): Promise<Buffer | undefined> {
    try {
      return Buffer.from(
        await (
          await this.client.getObject({
            Bucket: this.bucket,
            Key: pathPosix.join(this.root, file),
          })
        ).Body!.transformToByteArray(),
      );
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "NoSuchKey") return undefined;
      else throw e;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    const listRoot = pathPosix.join(this.root, prefix);
    const paginator = paginateListObjectsV2(
      { client: this.client },
      {
        Bucket: this.bucket,
        Prefix: listRoot,
      },
    );
    const result: string[] = [];
    for await (const page of paginator)
      result.push(...(page.Contents ?? []).map((e) => pathPosix.relative(listRoot, e.Key!)));
    return result;
  }

  async putFile(file: string, buffer: Buffer): Promise<void> {
    await this.client.putObject({
      Bucket: this.bucket,
      Key: pathPosix.join(this.root, file),
      Body: buffer,
    });
  }

  async deleteFiles(...files: string[]): Promise<void> {
    // TODO implement support of more than 1000 files
    const results = await this.client.deleteObjects({
      Bucket: this.bucket,
      Delete: {
        Objects: files.map((file) => ({
          Key: pathPosix.join(this.root, file),
        })),
      },
    });
    if (results.Errors !== undefined && results.Errors.length > 0)
      throw new Error(
        `Errors encountered while deleting files: ${results.Errors.map((e) => e.Message ?? e.Code ?? "Unknown error").join("\n")}`,
      );
  }
}

type GcsBucket = import("@google-cloud/storage").Bucket;

/** How many single-object deletes run in parallel: GCS has no multi-object delete call. */
const GcsDeleteConcurrency = 16;

/**
 * Registry storage on Google Cloud Storage, addressed as `gs://<bucket>/<prefix>`.
 *
 * Authenticates with Application Default Credentials (gcloud ADC, a service account key in
 * GOOGLE_APPLICATION_CREDENTIALS, Workload Identity, or GitHub OIDC via google-github-actions/auth).
 *
 * Objects are written with `Cache-Control: no-cache`. Registry overviews and channel markers are
 * overwritten in place, and GCS serves publicly readable objects with `max-age=3600` by default,
 * so without it readers would see a stale registry for up to an hour.
 */
export class GcsStorage implements RegistryStorage {
  private bucketPromise?: Promise<GcsBucket>;

  constructor(
    public readonly bucketName: string,
    public readonly root: string,
    bucket?: GcsBucket,
  ) {
    if (bucket) this.bucketPromise = Promise.resolve(bucket);
  }

  /** The client library is loaded on first use, so that readers of this module never load it. */
  private bucket(): Promise<GcsBucket> {
    this.bucketPromise ??= import("@google-cloud/storage").then(({ Storage }) =>
      new Storage().bucket(this.bucketName),
    );
    return this.bucketPromise;
  }

  private key(file: string): string {
    return pathPosix.join(this.root, file);
  }

  async getFile(file: string): Promise<Buffer | undefined> {
    try {
      const [content] = await (await this.bucket()).file(this.key(file)).download();
      return content;
    } catch (e: unknown) {
      if (isGcsNotFound(e)) return undefined;
      throw e;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    const listRoot = pathPosix.join(this.root, prefix);
    const [files] = await (await this.bucket()).getFiles({ prefix: listRoot, autoPaginate: true });
    return files.map((f) => pathPosix.relative(listRoot, f.name));
  }

  async putFile(file: string, buffer: Buffer): Promise<void> {
    await (await this.bucket()).file(this.key(file)).save(buffer, {
      resumable: false,
      metadata: { cacheControl: "no-cache" },
    });
  }

  async deleteFiles(...files: string[]): Promise<void> {
    const bucket = await this.bucket();
    const errors: string[] = [];
    for (let i = 0; i < files.length; i += GcsDeleteConcurrency) {
      const results = await Promise.allSettled(
        files
          .slice(i, i + GcsDeleteConcurrency)
          // A missing object is not an error, same as S3 DeleteObjects.
          .map((file) => bucket.file(this.key(file)).delete({ ignoreNotFound: true })),
      );
      for (const r of results)
        if (r.status === "rejected")
          errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
    }
    if (errors.length > 0)
      throw new Error(`Errors encountered while deleting files: ${errors.join("\n")}`);
  }
}

function isGcsNotFound(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && e.code === 404;
}

export class FSStorage implements RegistryStorage {
  /** Absolute path */
  public readonly root: string;

  constructor(_root: string) {
    this.root = path.resolve(_root);
  }

  private toAbsolutePath(localPath: string): string {
    if (pathPosix.isAbsolute(localPath)) throw new Error("absolute path");
    return path.resolve(this.root, localPath.split(pathPosix.sep).join(path.sep));
  }

  async getFile(address: string): Promise<Buffer | undefined> {
    try {
      return await fs.promises.readFile(this.toAbsolutePath(address));
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") return undefined;
      else throw err;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    try {
      const listRoot = this.toAbsolutePath(prefix);
      return (await fs.promises.readdir(listRoot, { recursive: true, withFileTypes: true }))
        .filter((e) => e.isFile())
        .map((e) =>
          path
            .relative(listRoot, path.resolve(e.parentPath, e.name))
            .split(path.sep)
            .join(pathPosix.sep),
        );
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && err.code === "ENOENT") return [];
      else throw err;
    }
  }

  async putFile(address: string, buffer: Buffer): Promise<void> {
    const absoluteAddress = this.toAbsolutePath(address);
    await fs.promises.mkdir(path.dirname(absoluteAddress), { recursive: true });
    await fs.promises.writeFile(absoluteAddress, buffer);
  }

  async deleteFiles(...files: string[]): Promise<void> {
    // Folders are not removed, deletes issued sequentially
    for (const file of files) await fs.promises.rm(this.toAbsolutePath(file));
  }
}

export function storageByUrl(address: string): RegistryStorage {
  const url = new URL(address, `file:${path.resolve(".").split(path.sep).join(pathPosix.sep)}/`);
  switch (url.protocol) {
    case "file:": {
      const root = path.resolve(url.pathname);
      return new FSStorage(root);
    }
    case "s3:": {
      const options: NonNullable<ConstructorParameters<typeof S3>[0]> = {};
      const region = url.searchParams.get("region");
      if (region) options.region = region;
      const bucket = url.hostname;
      return new S3Storage(new S3(options), bucket, url.pathname.replace(/^\//, ""));
    }
    case "gs:":
      return new GcsStorage(url.hostname, url.pathname.replace(/^\//, ""));
    default:
      throw new Error(`Unknown protocol: ${url.protocol}`);
  }
}
