import { spawn } from "child_process";
import winston from "winston";
import { PackageInfo } from "./package-info";
import { SoftwareDescriptor, softwareSource, readSoftwareInfo } from "./sw-json";
import { BuildMode } from "./flags";
import * as archive from "./archive";
import * as storage from "./storage";
import { ArchType, currentArch, currentOS, OSType } from "./util";
import { createReadStream } from "fs";

export class Core {
    private readonly logger: winston.Logger
    public readonly pkg: PackageInfo
    public readonly descriptor: SoftwareDescriptor
    public buildMode: BuildMode
    public targetOS: OSType
    public targetArch: ArchType

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
    }

    public get archivePath(): string {
        return archive.getPath(this.archiveOptions)
    }

    public buildDescriptor(sources: softwareSource[]) {
        const swJson = this.descriptor.render(this.buildMode, sources)
        this.descriptor.write(swJson)
    }

    public buildPackage(options?: { archivePath?: string, contentRoot?: string }) {
        if (!this.pkg.hasBinary) {
            this.logger.error("no 'binary' configuration found: package build is impossible for given 'pl.package.yaml' file")
            throw new Error("no 'binary' configuration")
        }

        if (this.buildMode === 'dev-local') {
            this.logger.info(`  no need to build pack software archive in '${this.buildMode}' mode: binary build was skipped`)
            return
        }

        const archivePath = options?.archivePath ?? this.archivePath
        const contentRoot = options?.contentRoot ?? this.pkg.binary.contentRoot

        this.logger.info("Packing software into a package")
        if (this.pkg.binary.crossplatform) {
            this.logger.info(`  package is marked as cross-platform, generating single package for all platforms`)
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
        const swInfo = readSoftwareInfo(this.pkg.packageRoot, this.pkg.name)
        if (swInfo.isDev) {
            this.logger.error("You are trying to publish software descriptor generated in 'dev' mode. This software would not be accepted for execution by any production environment.")
            throw new Error("attempt to publish 'dev' software descriptor")
        }

        this.logger.info("Running 'npm publish' to publish NPM package with software descriptors...")

        const args = ["publish"]
        if (options?.npmPublishArgs) {
            args.push(...options!.npmPublishArgs!)
        }

        const child = spawn("npm", args, { stdio: 'inherit', cwd: this.pkg.packageRoot })
        child.on('exit', (code) => {
            process.exit(code ?? 0);
        });
    }

    public publishPackage(options?: {
        archivePath?: string,
        storageURL?: string,
    }) {
        const archivePath = options?.archivePath ?? this.archivePath
        const storageURL = options?.storageURL ?? this.pkg.binary.registry.storageURL

        if (!storageURL) {
            this.logger.error(`no storage URL is set for registry ${this.pkg.binary.registry.name}`)
            throw new Error("binary.registry.storageURL is empty. Set it as command option or in 'pl.package.yaml' file")
        }

        this.logger.info(`Publishing package '${this.pkg.binary.name}' into registry '${this.pkg.binary.registry.name}'`)
        this.logger.debug(`  registry storage URL: '${storageURL}'`)
        this.logger.debug(`  archive to publish: '${archivePath}'`)

        const s = storage.initByUrl(storageURL, this.pkg.packageRoot)
        const archive = createReadStream(archivePath)
        const dstName = this.pkg.binary.fullName(this.targetOS, this.targetArch)
        s.putFile(dstName, archive)

        this.logger.info(`Package '${this.pkg.binary.name}' was published to '${this.pkg.binary.registry.name}:${dstName}'`)
    }

    private get archiveOptions(): archive.archiveOptions {
        return {
            packageRoot: this.pkg.packageRoot,
            packageName: this.pkg.binary.name,
            packageVersion: this.pkg.binary.version,

            crossplatform: this.pkg.binary.crossplatform,
            os: this.targetOS,
            arch: this.targetArch,
        }
    }
}
