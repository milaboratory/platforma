import * as path from 'path';
import * as tar from 'tar';
import * as util from './util';
import winston from 'winston';
import { PackageInfo } from './package-info';

export type archiveOptions = {
    packageRoot: string,
    packageName: string,
    packageVersion: string,

    crossplatform: boolean,
    os: util.OSType,
    arch: util.ArchType
}

export function optionsForPackage(pkg: PackageInfo, os?: util.OSType, arch?: util.ArchType): archiveOptions {
    return {
        packageRoot: pkg.packageRoot,
        packageName: pkg.binary.name,
        packageVersion: pkg.binary.version,

        crossplatform: pkg.binary!.crossplatform,
        os: os ?? util.currentOS(),
        arch: arch ?? util.currentArch(),
    }
}

export function getPath(
    options: archiveOptions
): string {
    const packageName = options.packageName.replaceAll("/", "-").replaceAll("\\", "-")

    if (options && !options.crossplatform) {
        return path.resolve(options.packageRoot, `pkg-${packageName}-${options.packageVersion}-${options.os}-${options.arch}.tgz`)
    }

    return path.resolve(options.packageRoot, `pkg-${packageName}-${options.packageVersion}.tgz`)
}

export function create(contentRoot: string, dstArchivePath: string) {
    tar.c(
        {
            gzip: true,
            file: dstArchivePath,
            cwd: contentRoot,
            sync: true
        },
        ['.']
    );
}
