import pathPosix from 'node:path/posix';
import { S3 } from '@aws-sdk/client-s3';
import path from 'path';
import * as util from './util';
import { Readable } from 'stream';

export const supportedTypes = ['S3'] as const; // add other types when we support them
export type storageType = (typeof supportedTypes)[number];

export function typeToURLScheme(sType: storageType): string {
    switch (sType) {
        case 'S3':
            return 's3'
        default:
            util.assertNever(sType)
    }

    throw new Error(`no schema defined for storage type ${sType}`) // just to calm down TS type analyzer
}

export interface RegistryStorage {
    exists(file: string): Promise<boolean>;
    putFile(file: string, data: Buffer | Readable): Promise<void>;
}

async function objectExists(client: S3, bucket: string, key: string) : Promise<boolean> {
    try {
        await client.headObject({
            Bucket: bucket,
            Key: key,
        });

        return true

    } catch (error) {
        if (error instanceof Error && error.name === 'NotFound') {
            return false;
        }

        throw util.wrapErr(error, `failed to check if object exists in S3 bucket ${bucket}`);
    }
}

async function newS3(options: NonNullable<ConstructorParameters<typeof S3>[0]>, bucket: string): Promise<S3> {
    const client = new S3(options)

    try {
        await objectExists(client, bucket, "/")
    } catch (error) {
        throw new Error(`credentials given to package builder do not have access to S3 bucket '${bucket}': ${error}`)
    }

    return client
}

export class S3Storage implements RegistryStorage {
    constructor(
        public readonly client: S3,
        public readonly bucket: string,
        public readonly root: string = ""
    ) { }

    async exists(file: string): Promise<boolean> {
        return objectExists(this.client, this.bucket, pathPosix.join(this.root, file))
    }

    async putFile(file: string, data: Buffer | Readable): Promise<void> {
        try {
            await this.client.putObject({
                Bucket: this.bucket,
                Key: pathPosix.join(this.root, file),
                Body: data
            });
        } catch (e) {
            throw util.wrapErr(e, `failed to put object into S3 bucket ${this.bucket}`)
        }
    }
}

export async function initByUrl(address: string, pkgRoot: string): Promise<RegistryStorage> {
    if (address === "") {
        throw new Error(`Empty registry storage address`)
    }

    try {
        const url = new URL(address, `file:${pkgRoot.split(path.sep).join(pathPosix.sep)}/`);
        switch (url.protocol) {
            case 's3:':
                const s3Options: NonNullable<ConstructorParameters<typeof S3>[0]> = {};
                const s3Region = url.searchParams.get('region');
                if (s3Region) s3Options.region = s3Region;
                const s3Bucket = url.hostname;
                const s3KeyPrefix = util.trimPrefix(url.pathname, "/");
                const s3Client = await newS3(s3Options, s3Bucket)
                return new S3Storage(s3Client, s3Bucket, s3KeyPrefix);

            case 's3e:':
                const s3eOptions: NonNullable<ConstructorParameters<typeof S3>[0]> = {};
                const s3eRegion = url.searchParams.get('region');
                if (s3eRegion) s3eOptions.region = s3eRegion;

                const s3ePath = url.pathname.split('/').slice(1); // '/bucket/keyPrefix' -> ['', 'bucket', 'keyPrefix'] -> ['bucket', 'keyPrefix']
                const s3eBucket = s3ePath[0];
                const s3eKeyPrefix = s3ePath.length > 1 ? util.trimPrefix(s3ePath[1], "/") : '';
                const s3eClient = await newS3(s3eOptions, s3eBucket)
                return new S3Storage(s3eClient, s3eBucket, s3eKeyPrefix)

            default:
                throw new Error(`Protocol ${url.protocol} is not supported for software registries yet. Use your own tooling for package upload`);
        }
    } catch (e) {
        throw util.wrapErr(e, `failed to init storage driver from URL`)
    }
}
