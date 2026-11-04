import pathPosix from "node:path/posix";
import { S3 } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import path from "node:path";
import * as util from "./util";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

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

export interface RegistryStorage {
  exists(file: string): Promise<boolean>;
  putFile(file: string, data: Buffer | Readable): Promise<void>;
}

async function objectExists(client: S3, bucket: string, key: string): Promise<boolean> {
  try {
    await client.headObject({
      Bucket: bucket,
      Key: key,
    });

    return true;
  } catch (error) {
    if (error instanceof Error && error.name === "NotFound") {
      return false;
    }

    throw util.wrapErr(error, `failed to check if object exists in S3 bucket ${bucket}`);
  }
}

async function newS3(
  options: NonNullable<ConstructorParameters<typeof S3>[0]>,
  bucket: string,
): Promise<S3> {
  const client = new S3(options);

  try {
    await objectExists(client, bucket, "/");
  } catch (error) {
    throw util.CLIError(
      `credentials given to package builder do not have access to S3 bucket '${bucket}': ${error}`,
    );
  }

  return client;
}

export class S3Storage implements RegistryStorage {
  constructor(
    public readonly client: S3,
    public readonly bucket: string,
    public readonly root: string = "",
  ) {}

  async exists(file: string): Promise<boolean> {
    return objectExists(this.client, this.bucket, pathPosix.join(this.root, file));
  }

  async putFile(file: string, data: Buffer | Readable): Promise<void> {
    try {
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucket,
          Key: pathPosix.join(this.root, file),
          Body: data,
        },
      });

      await upload.done();
    } catch (e) {
      throw util.wrapErr(e, `failed to put object into S3 bucket ${this.bucket}`);
    }
  }
}

type GcsBucket = import("@google-cloud/storage").Bucket;

/**
 * Software registry storage on Google Cloud Storage (`gs://<bucket>/<prefix>`).
 * Authenticates with Application Default Credentials.
 */
export class GcsStorage implements RegistryStorage {
  constructor(
    public readonly bucket: GcsBucket,
    public readonly root: string = "",
  ) {}

  async exists(file: string): Promise<boolean> {
    try {
      const [exists] = await this.bucket.file(pathPosix.join(this.root, file)).exists();
      return exists;
    } catch (e) {
      throw util.wrapErr(e, `failed to check if object exists in GCS bucket ${this.bucket.name}`);
    }
  }

  async putFile(file: string, data: Buffer | Readable): Promise<void> {
    const object = this.bucket.file(pathPosix.join(this.root, file));
    try {
      if (Buffer.isBuffer(data)) await object.save(data, { resumable: false });
      else await pipeline(data, object.createWriteStream({ resumable: true }));
    } catch (e) {
      throw util.wrapErr(e, `failed to put object into GCS bucket ${this.bucket.name}`);
    }
  }
}

async function newGcsBucket(bucketName: string): Promise<GcsBucket> {
  const { Storage } = await import("@google-cloud/storage");
  const bucket = new Storage().bucket(bucketName);
  try {
    await bucket.file("/").exists();
  } catch (error) {
    throw util.CLIError(
      `credentials given to package builder do not have access to GCS bucket '${bucketName}': ${error}`,
    );
  }
  return bucket;
}

export async function initByUrl(address: string, pkgRoot: string): Promise<RegistryStorage> {
  if (address === "") {
    throw util.CLIError(`Empty registry storage address`);
  }

  try {
    const url = new URL(address, `file:${pkgRoot.split(path.sep).join(pathPosix.sep)}/`);
    switch (url.protocol) {
      case "s3:": {
        const s3Options: NonNullable<ConstructorParameters<typeof S3>[0]> = {};
        const s3Region = url.searchParams.get("region");
        if (s3Region) s3Options.region = s3Region;
        const s3Bucket = url.hostname;
        const s3KeyPrefix = util.trimPrefix(url.pathname, "/");
        const s3Client = await newS3(s3Options, s3Bucket);
        return new S3Storage(s3Client, s3Bucket, s3KeyPrefix);
      }
      case "s3e:": {
        // s3e://[user:password@]<endpoint>/<bucket>/<keyPrefix>?region=<name>, endpoint over http,
        // the same form pl-bootstrap uses for the backend's MinIO storages.
        const s3eOptions: NonNullable<ConstructorParameters<typeof S3>[0]> = {
          endpoint: `http://${url.host}`,
          forcePathStyle: true,
        };
        const s3eRegion = url.searchParams.get("region");
        if (s3eRegion) s3eOptions.region = s3eRegion;
        if (url.username)
          s3eOptions.credentials = {
            accessKeyId: decodeURIComponent(url.username),
            secretAccessKey: decodeURIComponent(url.password),
          };

        const s3ePath = url.pathname.split("/").slice(1); // '/bucket/keyPrefix' -> ['', 'bucket', 'keyPrefix'] -> ['bucket', 'keyPrefix']
        const s3eBucket = s3ePath[0];
        const s3eKeyPrefix = s3ePath.slice(1).join("/");
        const s3eClient = await newS3(s3eOptions, s3eBucket);
        return new S3Storage(s3eClient, s3eBucket, s3eKeyPrefix);
      }
      case "gs:": {
        const gsBucket = await newGcsBucket(url.hostname);
        return new GcsStorage(gsBucket, util.trimPrefix(url.pathname, "/"));
      }
      default:
        throw util.CLIError(
          `Protocol ${url.protocol} is not supported for software registries yet. Use your own tooling for package upload`,
        );
    }
  } catch (e) {
    throw util.wrapErr(e, `failed to init storage driver from URL`);
  }
}
