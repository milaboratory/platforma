import pathPosix from 'node:path/posix';
import { S3 } from '@aws-sdk/client-s3';
import path from 'path';
import * as util from './util';
import type { Readable } from 'stream';

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

export class S3Storage implements RegistryStorage {
    constructor(
        public readonly client: S3,
        public readonly bucket: string,
        public readonly root: string = ""
    ) { }

    async exists(file: string): Promise<boolean> {
        try {
            await this.client.headObject({
                Bucket: this.bucket,
                Key: pathPosix.join(this.root, file),
            });

            return true
        } catch (error) {
            if (error instanceof Error && error.name === 'NotFound') {
                return false;
            }

            throw error;
        }
    }

    async putFile(file: string, data: Buffer | Readable): Promise<void> {
        await this.client.putObject({
            Bucket: this.bucket,
            Key: pathPosix.join(this.root, file),
            Body: data
        });
    }
}

export function initByUrl(address: string, pkgRoot: string): RegistryStorage {
    const url = new URL(address, `file:${pkgRoot.split(path.sep).join(pathPosix.sep)}/`);
    switch (url.protocol) {
        case 's3:':
            const options: NonNullable<ConstructorParameters<typeof S3>[0]> = {};
            const region = url.searchParams.get('region');
            if (region) options.region = region;
            const bucket = url.hostname;
            return new S3Storage(new S3(options), bucket, util.trimPrefix(url.pathname, "/"));

        default:
            throw new Error(`Protocol ${url.protocol} is not supported for software registries yet. Use your own tooling for package upload`);
    }
}
