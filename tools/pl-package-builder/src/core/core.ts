import fs from 'fs';
import path from 'path';
import { spawnSync } from "child_process";
import winston from "winston";
import { PackageInfo, CommonBinaryConfig } from "./package-info";
import { SoftwareDescriptor, listSoftwareIDs, readSoftwareInfo } from "./sw-json";
import * as util from "./util";
import * as archive from "./archive";
import * as storage from "./storage";
import { ArchType, currentArch, currentOS, OSType } from "./util";
import { createReadStream } from "fs";

export class Core {
    private readonly logger: winston.Logger
    public readonly pkg: PackageInfo
    public readonly descriptor: SoftwareDescriptor
    public buildMode: util.BuildMode
    public targetOS: OSType
    public targetArch: ArchType
    public fullDirHash: boolean

    constructor(
        logger: winston.Logger,
        pkgInfo?: PackageInfo,
    ) {
        this.logger = logger
        this.pkg = pkgInfo ?? new PackageInfo(logger)
        this.descriptor = new SoftwareDescriptor(logger, this.pkg)

        this.buildMode = 'release'
        this.targetOS = currentOS()
        this.targetArch = currentArch()

        this.fullDirHash = false
    }

    public get archivePath(): string {
        return archive.getPath(this.archiveOptions)
    }

    public set packageName(v: string) {
        if (this.pkg.hasBinary) {
            this.pkg.binary.name = v
        }
        if (this.pkg.hasEnvironment) {
            this.pkg.environment.name = v
        }
    }

    public buildDescriptor(sources: util.SoftwareSource[]) {
        const swJson = this.descriptor.render(this.buildMode, sources, this.fullDirHash)
        this.descriptor.write(swJson)
    }

    public buildPackage(options?: { archivePath?: string, contentRoot?: string }) {
        if (!this.pkg.hasBinary && !this.pkg.hasEnvironment) {
            this.logger.error("no 'binary' configuration found: package build is impossible for given 'pl.package.yaml' file")
            throw new Error("no 'binary' configuration")
        }

        if (this.buildMode === 'dev-local') {
            this.logger.info(`  no need to build pack software archive in '${this.buildMode}' mode: binary build was skipped`)
            return
        }

        const desc = this.binaryDescriptor
        const archivePath = options?.archivePath ?? this.archivePath
        const contentRoot = options?.contentRoot ?? desc.contentRoot

        this.logger.info("Rendering 'package.sw.json' to be embedded into package archive")
        const swInfo = this.descriptor.render(this.buildMode, ['binary'], this.fullDirHash)
        const swInfoPath = path.resolve(contentRoot, "package.sw.json")
        fs.writeFileSync(swInfoPath, JSON.stringify(swInfo))

        this.logger.info("Packing software into a package")
        if (desc.crossplatform) {
            this.logger.info(`  generating cross-platform package`)
        } else {
            this.logger.info(`  generating package for os='${this.targetOS}', arch='${this.targetArch}'`)
        }
        this.logger.debug(`  package content root: '${contentRoot} '`)
        this.logger.debug(`  package destination archive: '${archivePath}'`)

        archive.create(contentRoot, archivePath)

        this.logger.info(`Software package was written to '${archivePath}'`)
    }

    public publishDescriptor(options?: {
        npmPublishArgs?: string[],
    }) {
        const names = listSoftwareIDs(this.pkg.packageRoot)

        if (names.length === 0) {
            throw new Error(`No descriptors found in package during 'publish descriptor' action. Nothing to publish`)
        }

        for (const swName of names) {
            const swInfo = readSoftwareInfo(this.pkg.packageRoot, swName)
            if (swInfo.isDev) {
                this.logger.error("You are trying to publish software descriptor generated in 'dev' mode. This software would not be accepted for execution by any production environment.")
                throw new Error("attempt to publish 'dev' software descriptor")
            }
        }

        this.logger.info("Running 'npm publish' to publish NPM package with software descriptors...")

        const args = ["publish"]
        if (options?.npmPublishArgs) {
            args.push(...options!.npmPublishArgs!)
        }

        const result = spawnSync("npm", args, { stdio: 'inherit', cwd: this.pkg.packageRoot })
        if (result.error) {
            throw result.error
        }
        if (result.status !== 0) {
            throw new Error("'npm publish' failed with non-zero exit code")
        }
    }

    public publishPackage(options?: {
        archivePath?: string,
        storageURL?: string,
    }) {
        const desc = this.binaryDescriptor
        const archivePath = options?.archivePath ?? this.archivePath
        const storageURL = options?.storageURL ?? desc.registry.storageURL
        const dstName = desc.fullName(this.targetOS, this.targetArch)

        if (!storageURL) {
            this.logger.error(`no storage URL is set for registry ${desc.registry.name}`)
            if (this.pkg.hasEnvironment) {
                throw new Error("environment.registry.storageURL is empty. Set it as command option or in 'pl.package.yaml' file")
            } else {
                throw new Error("environment.registry.storageURL is empty. Set it as command option or in 'pl.package.yaml' file")
            }
        }

        this.logger.info(`Publishing package '${desc.name}' into registry '${desc.registry.name}'`)
        this.logger.debug(`  registry storage URL: '${storageURL}'`)
        this.logger.debug(`  archive to publish: '${archivePath}'`)
        this.logger.debug(`  target package name: '${dstName}'`)

        const s = storage.initByUrl(storageURL, this.pkg.packageRoot)
        const archive = createReadStream(archivePath)

        s.putFile(dstName, archive).then(
            () => this.logger.info(`Package '${desc.name}' was published to '${desc.registry.name}:${dstName}'`)
        )
    }

    private get binaryDescriptor(): CommonBinaryConfig {
        return this.pkg.hasEnvironment ? this.pkg.environment! : this.pkg.binary!
    }

    private get archiveOptions(): archive.archiveOptions {
        const desc = this.binaryDescriptor

        return {
            packageRoot: this.pkg.packageRoot,
            packageName: desc.name,
            packageVersion: desc.version,

            crossplatform: desc.crossplatform,
            os: this.targetOS,
            arch: this.targetArch,
        }
    }
}
