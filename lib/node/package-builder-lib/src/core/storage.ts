import pathPosix from "node:path/posix";
import path from "node:path";
import * as fs from "node:fs";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { paginateListObjectsV2, S3 } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import * as util from "./util";

/**
 * Object storage behind a block registry or a software registry. One implementation is shared by
 * block-tools (block registries) and package-builder (software packages).
 *
 * Addressed by URL, see {@link storageByUrl}: `file:`, `s3://`, `s3e://`, `s3es://` and `gs://`.
 */
export interface RegistryStorage {
  /** Optional for custom implementations; callers fall back to {@link getFile}. */
  exists?(file: string): Promise<boolean>;

  getFile(file: string): Promise<Buffer | undefined>;

  listFiles(prefix: string): Promise<string[]>;

  putFile(file: string, data: Buffer | Readable): Promise<void>;

  deleteFiles(...files: string[]): Promise<void>;

  /**
   * Fails with a readable error if the configured credentials cannot reach the storage.
   * Optional for custom implementations; without it, access problems surface on first use.
   */
  checkAccess?(): Promise<void>;
}

export const supportedTypes = ["S3", "GCS"] as const; // add other types when we support them
export type storageType = (typeof supportedTypes)[number];

export function typeToURLScheme(sType: storageType): string {
  switch (sType) {
    case "S3":
      return "s3";
    case "GCS":
      return "gs";
    default:
      util.assertNever(sType);
      throw new Error("no schema defined for storage type"); // just to calm down TS type analyzer
  }
}

//
// S3
//

/** The DeleteObjects limit. */
const S3DeleteBatchSize = 1000;

export class S3Storage implements RegistryStorage {
  constructor(
    public readonly client: S3,
    public readonly bucket: string,
    public readonly root: string = "",
  ) {}

  private key(file: string): string {
    return pathPosix.join(this.root, file);
  }

  async checkAccess(): Promise<void> {
    try {
      // Probe inside the prefix: credentials may be scoped to <bucket>/<prefix>/*.
      await this.objectExists(this.key(".access-check"));
    } catch (error) {
      throw util.CLIError(
        `credentials do not have access to S3 bucket '${this.bucket}': ${String(error)}`,
      );
    }
  }

  async exists(file: string): Promise<boolean> {
    try {
      return await this.objectExists(this.key(file));
    } catch (error) {
      throw util.wrapErr(error, `failed to check if object exists in S3 bucket ${this.bucket}`);
    }
  }

  private async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.headObject({ Bucket: this.bucket, Key: key });
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === "NotFound") return false;
      throw error;
    }
  }

  async getFile(file: string): Promise<Buffer | undefined> {
    try {
      const response = await this.client.getObject({ Bucket: this.bucket, Key: this.key(file) });
      return Buffer.from(await response.Body!.transformToByteArray());
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "NoSuchKey") return undefined;
      throw e;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    const listRoot = pathPosix.join(this.root, prefix).replace(/^\.$/, "");
    const paginator = paginateListObjectsV2(
      { client: this.client },
      { Bucket: this.bucket, Prefix: listRoot },
    );
    const result: string[] = [];
    for await (const page of paginator)
      result.push(...(page.Contents ?? []).map((e) => pathPosix.relative(listRoot, e.Key!)));
    return result;
  }

  async putFile(file: string, data: Buffer | Readable): Promise<void> {
    try {
      // Upload switches to multipart for large bodies and accepts streams of unknown length.
      const upload = new Upload({
        client: this.client,
        params: { Bucket: this.bucket, Key: this.key(file), Body: data },
      });
      await upload.done();
    } catch (e) {
      throw util.wrapErr(e, `failed to put object into S3 bucket ${this.bucket}`);
    }
  }

  async deleteFiles(...files: string[]): Promise<void> {
    const errors: string[] = [];
    // DeleteObjects takes at most 1000 keys and rejects an empty list.
    for (let i = 0; i < files.length; i += S3DeleteBatchSize) {
      const results = await this.client.deleteObjects({
        Bucket: this.bucket,
        Delete: {
          Objects: files.slice(i, i + S3DeleteBatchSize).map((file) => ({ Key: this.key(file) })),
        },
      });
      for (const e of results.Errors ?? []) errors.push(e.Message ?? e.Code ?? "Unknown error");
    }
    if (errors.length > 0)
      throw new Error(`Errors encountered while deleting files: ${errors.join("\n")}`);
  }
}

/**
 * Parses `s3e[s]://[user:password@]<endpoint>/<bucket>/<keyPrefix>?region=<name>`, the same forms
 * pl-bootstrap uses for the backend's storages. s3e talks to the endpoint over http (local S3-compatible storage),
 * s3es over https; use s3es whenever credentials leave the machine.
 */
export function s3eConfigFromUrl(url: URL): {
  options: NonNullable<ConstructorParameters<typeof S3>[0]>;
  bucket: string;
  keyPrefix: string;
} {
  const scheme = url.protocol === "s3es:" ? "https" : "http";
  const options: NonNullable<ConstructorParameters<typeof S3>[0]> = {
    endpoint: `${scheme}://${url.host}`,
    forcePathStyle: true,
  };
  const region = url.searchParams.get("region");
  // The SDK needs a region to sign requests; most S3-compatible stores ignore it.
  options.region = region || process.env.AWS_REGION || "us-east-1";
  // URL keeps userinfo percent-encoded; a secret with '/', '+' or '@' must be written encoded.
  if (url.username)
    options.credentials = {
      accessKeyId: decodeURIComponent(url.username),
      secretAccessKey: decodeURIComponent(url.password),
    };

  const segments = url.pathname.split("/").slice(1); // '/bucket/keyPrefix' -> ['bucket', 'keyPrefix']
  if (!segments[0])
    throw new Error(
      `${url.protocol}// storage URL has no bucket: expected <endpoint>/<bucket>/<prefix>`,
    );
  return { options, bucket: segments[0], keyPrefix: segments.slice(1).join("/") };
}

//
// Google Cloud Storage
//

type GcsBucket = import("@google-cloud/storage").Bucket;

/** How many single-object deletes run in parallel: GCS has no multi-object delete call. */
const GcsDeleteConcurrency = 16;

/**
 * Storage on Google Cloud Storage, addressed as `gs://<bucket>/<prefix>`.
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
    public readonly root: string = "",
  ) {}

  /** The client library is loaded on first use, so that readers of this module never load it. */
  bucket(): Promise<GcsBucket> {
    // Every write overwrites a whole object and every delete ignores a missing object, so retrying
    // them is safe. The library default (RetryConditional) does not retry writes or deletes without
    // a generation precondition, and the shared update-seed object is rewritten on every publish
    // step, where GCS answers 429 to more than about one write per second.
    this.bucketPromise ??= import("@google-cloud/storage").then(
      ({ IdempotencyStrategy, Storage }) =>
        new Storage({
          retryOptions: { idempotencyStrategy: IdempotencyStrategy.RetryAlways },
        }).bucket(this.bucketName),
    );
    return this.bucketPromise;
  }

  private key(file: string): string {
    return pathPosix.join(this.root, file);
  }

  async checkAccess(): Promise<void> {
    try {
      // Probe inside the prefix: credentials may be scoped to <bucket>/<prefix>/*.
      await (await this.bucket()).file(this.key(".access-check")).exists();
    } catch (error) {
      throw util.CLIError(
        `credentials do not have access to GCS bucket '${this.bucketName}': ${String(error)}`,
      );
    }
  }

  async exists(file: string): Promise<boolean> {
    try {
      const [exists] = await (await this.bucket()).file(this.key(file)).exists();
      return exists;
    } catch (e) {
      throw util.wrapErr(e, `failed to check if object exists in GCS bucket ${this.bucketName}`);
    }
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
    const listRoot = pathPosix.join(this.root, prefix).replace(/^\.$/, "");
    const [files] = await (await this.bucket()).getFiles({ prefix: listRoot, autoPaginate: true });
    return files.map((f) => pathPosix.relative(listRoot, f.name));
  }

  async putFile(file: string, data: Buffer | Readable): Promise<void> {
    const object = (await this.bucket()).file(this.key(file));
    const metadata = { cacheControl: "no-cache" };
    try {
      if (Buffer.isBuffer(data)) await object.save(data, { resumable: false, metadata });
      else await pipeline(data, object.createWriteStream({ resumable: true, metadata }));
    } catch (e) {
      throw util.wrapErr(e, `failed to put object into GCS bucket ${this.bucketName}`);
    }
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

//
// Local file system
//

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

  async checkAccess(): Promise<void> {}

  async exists(file: string): Promise<boolean> {
    try {
      await fs.promises.access(this.toAbsolutePath(file));
      return true;
    } catch {
      return false;
    }
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

  async putFile(address: string, data: Buffer | Readable): Promise<void> {
    const absoluteAddress = this.toAbsolutePath(address);
    await fs.promises.mkdir(path.dirname(absoluteAddress), { recursive: true });
    if (Buffer.isBuffer(data)) await fs.promises.writeFile(absoluteAddress, data);
    else await pipeline(data, fs.createWriteStream(absoluteAddress));
  }

  async deleteFiles(...files: string[]): Promise<void> {
    // Folders are not removed, deletes issued sequentially. A missing file is not an error, same as
    // S3 and GCS.
    for (const file of files) await fs.promises.rm(this.toAbsolutePath(file), { force: true });
  }
}

//
// Address parsing
//

/**
 * `new URL()` that does not leak the address: Node's invalid-URL error carries the raw input, which
 * for `s3e[s]://user:password@...` is the secret (e.g. an unencoded '/' in it breaks parsing).
 */
function parseStorageUrl(address: string, base: string): URL {
  try {
    return new URL(address, base);
  } catch {
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(address)?.[1];
    throw new Error(
      `invalid storage URL${scheme ? ` with scheme '${scheme}:'` : ""}; ` +
        `percent-encode special characters in credentials`,
    );
  }
}

function bucketOf(url: URL): string {
  if (url.hostname === "")
    throw new Error(
      `${url.protocol}// storage URL has no bucket: expected ${url.protocol}//<bucket>/<prefix>`,
    );
  return url.hostname;
}

/** Schemes package-builder uploads to. A bare path or file: would quietly write under the package root. */
const softwareRegistrySchemes = new Set(["s3:", "s3e:", "s3es:", "gs:"]);

/**
 * Storage for a URL. Relative addresses and `file:` URLs resolve against `baseDir`.
 *
 * - `file:<path>`: a local folder
 * - `s3://<bucket>/<prefix>?region=<name>`: AWS S3, credentials from the AWS SDK chain
 * - `s3e[s]://[user:password@]<endpoint>/<bucket>/<prefix>`: S3 API behind a custom endpoint
 *   (http / https), see {@link s3eConfigFromUrl}
 * - `gs://<bucket>/<prefix>`: Google Cloud Storage, see {@link GcsStorage}
 *
 * No network call is made here; use {@link RegistryStorage.checkAccess} to fail early.
 */
export function storageByUrl(
  address: string,
  baseDir: string = path.resolve("."),
): RegistryStorage {
  const url = parseStorageUrl(address, `file:${baseDir.split(path.sep).join(pathPosix.sep)}/`);
  switch (url.protocol) {
    case "file:":
      return new FSStorage(path.resolve(url.pathname));
    case "s3:": {
      const options: NonNullable<ConstructorParameters<typeof S3>[0]> = {};
      const region = url.searchParams.get("region");
      if (region) options.region = region;
      return new S3Storage(new S3(options), bucketOf(url), util.trimPrefix(url.pathname, "/"));
    }
    case "s3e:":
    case "s3es:": {
      const { options, bucket, keyPrefix } = s3eConfigFromUrl(url);
      return new S3Storage(new S3(options), bucket, keyPrefix);
    }
    case "gs:":
      return new GcsStorage(bucketOf(url), util.trimPrefix(url.pathname, "/"));
    default:
      throw new Error(`Unknown protocol: ${url.protocol}`);
  }
}

/** {@link storageByUrl} for package-builder: resolves against the package root and checks access. */
export async function initByUrl(address: string, pkgRoot: string): Promise<RegistryStorage> {
  if (address === "") {
    throw util.CLIError(`Empty registry storage address`);
  }

  try {
    const scheme = /^([a-z][a-z0-9+.-]*:)/i.exec(address)?.[1]?.toLowerCase();
    if (scheme === undefined || !softwareRegistrySchemes.has(scheme))
      throw util.CLIError(
        `Protocol ${scheme ?? "(none)"} is not supported for software registries yet. ` +
          `Use ${[...softwareRegistrySchemes].join(", ")} or your own tooling for package upload`,
      );
    const storage = storageByUrl(address, pkgRoot);
    await storage.checkAccess?.();
    return storage;
  } catch (e) {
    throw util.wrapErr(e, `failed to init storage driver from URL`);
  }
}
