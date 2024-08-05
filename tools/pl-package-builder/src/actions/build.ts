import winston from 'winston';
import { PackageInfo } from '../core/package-info';
import { SoftwareDescriptor, allSoftwareSources, softwareSource } from '../core/sw-json';
import { BuildMode } from '../core/flags';
import * as util from '../core/util';
import * as archive from '../core/archive';


export function descriptor(logger: winston.Logger, mode: BuildMode, sources: readonly softwareSource[]) {
    const pkgRoot = util.findPackageRoot(logger)

    const pkg = new PackageInfo(logger, pkgRoot)
    const sw = new SoftwareDescriptor(logger, pkg, mode)

    if (sources.length === 0) {
        sources = allSoftwareSources
    }

    const swJson = sw.render(...sources)
    sw.write(swJson)
}

export function packageArchive(logger: winston.Logger, options?: {
    os?: util.OStype,
    arch?: util.ArchType,
}) {
    const pkgRoot = util.findPackageRoot(logger)
    const pkg = new PackageInfo(logger, pkgRoot)

    if (!pkg.hasBinary) {
        logger.error("no 'binary' configuration found: package build is impossible for given 'pl.package.yaml' file")
        throw new Error("no 'binary' configuration")
    }

    const targetOS = options?.os ?? util.currentOS()
    const targetArch = options?.arch ?? util.currentArch()

    const archiveOptions: archive.archiveOptions = {
        packageRoot: pkg.packageRoot,
        packageName: pkg.binary.name,
        packageVersion: pkg.binary.version,

        crossplatform: pkg.binary!.crossplatform,
        os: targetOS,
        arch: targetArch,
    }

    archive.pack(logger, pkg.binary.contentRoot, archiveOptions)
}
