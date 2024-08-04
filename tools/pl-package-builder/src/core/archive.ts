import * as path from 'path';
import * as tar from 'tar';
import { ArchType, OStype } from './util';

export type pathOptions = {
    os: OStype,
    arch: ArchType
}

export function getPath(
    packageRootDir: string,
    packageName: string,
    packageVersion: string,
    options?: pathOptions
): string {
    packageName = path.basename(packageName)

    if (options) {
        return path.resolve(packageRootDir, `pkg-${packageName}-${packageVersion}-${options.os}-${options.arch}.tgz`)
    }

    return path.resolve(packageRootDir, `pkg-${packageName}-${packageVersion}.tgz`)
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
