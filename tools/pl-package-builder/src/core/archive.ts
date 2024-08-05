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
    const packageName = path.basename(options.packageName)

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

export function pack(
    logger: winston.Logger,
    contentRoot: string,
    options: archiveOptions,
) {
    const archivePath = getPath(options)

    logger.info("Packing software into a package")
    if (options.crossplatform) {
        logger.info(`  package is marked as cross-platform, generating single package for all platforms`)
    } else {
        logger.info(`  generating package for os='${options.os}', arch='${options.arch}'`)
    }
    logger.debug(`  package content root: '${contentRoot} '`)
    logger.debug(`  package destination archive: '${archivePath}'`)

    create(contentRoot, archivePath)

    logger.info(`Software package was written to '${archivePath}'`)
}
