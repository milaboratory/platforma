import fs from 'fs';
import path from 'path';
import { spawnSync } from "child_process";
import winston from "winston";
import { PackageInfo, PackageConfig, Entrypoint } from "./package-info";
import { Renderer, listSoftwareNames as listSoftwareEntrypoints, readEntrypointDescriptor } from "./renderer";
import * as binSchema from './schemas/artifacts';
import * as util from "./util";
import * as archive from "./archive";
import * as storage from "./storage";

export class Core {
    private readonly logger: winston.Logger
    private _entrypoints: Map<string, Entrypoint> | undefined
    private _renderer: Renderer | undefined

    public readonly pkg: PackageInfo
    public buildMode: util.BuildMode
    public targetPlatform: util.PlatformType | undefined
    public allPlatforms: boolean = false
    public fullDirHash: boolean

    constructor(
        logger: winston.Logger,
        pkgInfo?: PackageInfo,
    ) {
        this.logger = logger
        this.pkg = pkgInfo ?? new PackageInfo(logger)

        this.buildMode = 'release'

        this.fullDirHash = false
    }

    public binArchivePath(pkg: PackageConfig, os: util.OSType, arch: util.ArchType): string {
        return archive.getPath(this.archiveOptions(pkg, os, arch, 'tgz'))
    }

    public assetArchivePath(pkg: PackageConfig, os: util.OSType, arch: util.ArchType): string {
        return archive.getPath(this.archiveOptions(pkg, os, arch, 'zip'))
    }

    public get entrypoints(): Map<string, Entrypoint> {
        if (!this._entrypoints) {
            this._entrypoints = this.pkg.entrypoints
        }

        return this._entrypoints
    }

    public get packages(): Map<string, PackageConfig> {
        return new Map(
            Array.from(this.entrypoints.entries())
                .map(([_, ep]) => [ep.package.id, ep.package])
        )
    }

    public get packageEntrypointsIndex(): Map<string, string[]> {
        const result = new Map<string, string[]>()

        for (const [epName, ep] of this.entrypoints) {
            if (!result.has(ep.package.id)) {
                result.set(ep.package.id, [])
            }

            result.get(ep.package.id)!.push(epName)
        }

        return result
    }

    public get buildablePackages(): Map<string, PackageConfig> {
        return new Map(
            Array.from(this.packages.entries())
                .filter(([, value]) => value.isBuildable)
        )
    }

    public getPackage(id: string): PackageConfig {
        const pkg = this.packages.get(id)
        if (!pkg) {
            this.logger.error(`package with id '${id}' not found in ${util.softwareConfigName} file`)
            throw new Error(`no package with id '${id}'`)
        }
        return pkg
    }

    public buildDescriptors(options?: {
        ids?: string[],
        entrypoints?: string[],
        sources?: util.SoftwareSource[]
    }) {
        const index = this.packageEntrypointsIndex

        const entrypointNames = options?.entrypoints ?? []
        if (options?.ids) {
            for (const pkgId of options.ids) {
                const packageEntrypoints = index.get(pkgId)
                if (!packageEntrypoints || packageEntrypoints.length === 0) {
                    throw new Error(`cannot build descriptor for package ${pkgId}: no entrypoints found for package`)
                }

                entrypointNames.push(...packageEntrypoints)
            }
        }

        var entrypoints = Array.from(this.entrypoints.entries())
        if (entrypointNames.length > 0) {
            entrypoints = entrypoints.filter(
                ([epName, _]) => entrypointNames.includes(epName)
            )
        }

        const infos = this.renderer.renderSoftwareEntrypoints(this.buildMode, new Map(entrypoints), {
            sources: options?.sources,
            fullDirHash: this.fullDirHash
        })

        for (const swJson of infos.values()) {
            this.renderer.writeEntrypointDescriptor(swJson)
        }
    }

    public async buildPackages(options?: {
        ids?: string[],
        forceBuild?: boolean,

        archivePath?: string,
        contentRoot?: string,
        skipIfEmpty?: boolean,
    }) {
        const packagesToBuild = options?.ids ?? Array.from(this.buildablePackages.keys())

        if (packagesToBuild.length > 1 && options?.archivePath && !options.forceBuild) {
            this.logger.error("Attempt to build several packages targeting single package archive. This will simply overwrite the archive several times. If you know what you are doing, add '--force' flag")
            throw new Error("attempt to build several packages using the same software package archive")
        }

        for (const pkgID of packagesToBuild) {
            const pkg = this.getPackage(pkgID)

            if (pkg.crossplatform) {
                await this.buildPackage(pkg, util.currentPlatform(), options)
            } else if (this.targetPlatform) {
                await this.buildPackage(pkg, this.targetPlatform, options)
            } else if (this.allPlatforms && !pkg.isMultiroot) {
                const currentPlatform = util.currentPlatform()
                this.logger.warn(
                    `packages are requested to be build for all supported platforms, but package '${pkgID}' has single archive root for all platforms and will be built only for '${currentPlatform}'`,
                )
                await this.buildPackage(pkg, currentPlatform, options)
            } else if (this.allPlatforms) {
                for (const platform of pkg.platforms) {
                    await this.buildPackage(pkg, platform, options)
                }
            } else {
                await this.buildPackage(pkg, util.currentPlatform(), options)
            }
        }
    }

    public async buildPackage(pkg: PackageConfig, platform: util.PlatformType, options?: {
        archivePath?: string, contentRoot?: string,
        skipIfEmpty?: boolean,
    }) {
        this.logger.info(`Building software package '${pkg.id}' for platform '${platform}'...`)
        const { os, arch } = util.splitPlatform(platform)

        if (!pkg.isBuildable) {
            if (options?.skipIfEmpty) {
                this.logger.info(`  archive build was skipped: package '${pkg.id}' is not buildable`)
            }
            this.logger.error(`  not buildable: artifact '${pkg.id}' archive build is impossible for configuration inside '${util.softwareConfigName}'`)
            throw new Error("not a buildable artifact")
        }

        const contentRoot = options?.contentRoot ?? pkg.contentRoot(platform)

        if (pkg.type === 'asset') {
            const archivePath = options?.archivePath ?? this.assetArchivePath(pkg, os, arch)
            await this.createPackageArchive('assets', pkg, archivePath, contentRoot, os, arch)
            return
        }

        if (this.buildMode === 'dev-local') {
            this.logger.info(`  no need to build software archive in '${this.buildMode}' mode: archive build was skipped`)
            return
        }

        const archivePath = options?.archivePath ?? this.binArchivePath(pkg, os, arch)

        await this.createPackageArchive('software', pkg, archivePath, contentRoot, os, arch)
    }

    private async createPackageArchive(
        packageContentType: string,
        pkg: PackageConfig,
        archivePath: string,
        contentRoot: string,
        os: string,
        arch: string
    ) {
        this.logger.debug(`  rendering 'package.sw.json' to be embedded into ${packageContentType} archive`)
        const swJson = this.renderer.renderPackageDescriptor(this.buildMode, pkg)

        const swJsonPath = path.join(contentRoot, "package.sw.json")
        fs.writeFileSync(swJsonPath, JSON.stringify(swJson))

        this.logger.info(`  packing ${packageContentType} into a package`)
        if (pkg.crossplatform) {
            this.logger.info(`    generating cross-platform package`)
        } else {
            this.logger.info(`    generating package for os='${os}', arch='${arch}'`)
        }
        this.logger.debug(`    package content root: '${contentRoot} '`)
        this.logger.debug(`    package destination archive: '${archivePath}'`)

        await archive.create(this.logger, contentRoot, archivePath)

        this.logger.info(`  ${packageContentType} package was written to '${archivePath}'`)
    }

    public publishDescriptors(options?: {
        npmPublishArgs?: string[],
    }) {
        const names = listSoftwareEntrypoints(this.pkg.packageRoot)

        if (names.length === 0) {
            throw new Error(`No software entrypoints found in package during 'publish descriptors' action. Nothing to publish`)
        }

        for (const swName of names) {
            const swInfo = readEntrypointDescriptor(this.pkg.packageName, this.pkg.packageRoot, swName)
            if (swInfo.isDev) {
                this.logger.error("You are trying to publish entrypoint descriptor generated in 'dev' mode. This software would not be accepted for execution by any production environment.")
                throw new Error("attempt to publish 'dev' entrypoint descriptor")
            }
        }

        this.logger.info("Running 'npm publish' to publish NPM package with entrypoint descriptors...")

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

    public async publishPackages(options?: {
        ids?: string[],
        ignoreArchiveOverlap?: boolean,

        archivePath?: string,
        storageURL?: string,

        skipExisting?: boolean,
        forceReupload?: boolean,
    }) {
        const packagesToPublish = options?.ids ?? Array.from(this.buildablePackages.keys())

        if (packagesToPublish.length > 1 && options?.archivePath && !options.ignoreArchiveOverlap) {
            this.logger.error("Attempt to publish several pacakges using single package archive. This will upload the same archive under several different names. If you know what you are doing, add '--force' flag")
            throw new Error("attempt to publish several packages using the same software package archive")
        }

        const uploads: Promise<void>[] = []
        for (const pkgID of packagesToPublish) {
            const pkg = this.getPackage(pkgID)

            if (pkg.crossplatform) {
                uploads.push(this.publishPackage(pkg, util.currentPlatform(), options))
            } else if (this.targetPlatform) {
                uploads.push(this.publishPackage(pkg, this.targetPlatform, options))
            } else if (this.allPlatforms) {
                for (const platform of pkg.platforms) {
                    uploads.push(this.publishPackage(pkg, platform, options))
                }
            } else {
                uploads.push(this.publishPackage(pkg, util.currentPlatform(), options))
            }
        }

        return Promise.all(uploads)
    }

    public async publishPackage(pkg: PackageConfig, platform: util.PlatformType, options?: {
        archivePath?: string,
        storageURL?: string,

        skipExisting?: boolean,
        forceReupload?: boolean
    }) {
        const { os, arch } = util.splitPlatform(platform)

        const storageURL = options?.storageURL ?? pkg.registry.storageURL

        var archivePath = options?.archivePath
        if (!archivePath) {
            if (pkg.type === 'asset') {
                archivePath = this.assetArchivePath(pkg, os, arch)
            } else {
                archivePath = this.binArchivePath(pkg, os, arch)
            }
        }

        const dstName = pkg.fullName(platform)

        if (!storageURL) {
            const regNameUpper = pkg.registry.name.toUpperCase()
            this.logger.error(`no storage URL is set for registry ${pkg.registry.name}`)
            throw new Error(`'registry.storageURL' of package '${pkg.id}' is empty. Set it as command option, in '${util.softwareConfigName}' file or via environment variable 'PL_REGISTRY_${regNameUpper}_UPLOAD_URL'`)
        }

        const signatureSuffixes = this.findSignatures(archivePath)

        this.logger.info(`Publishing package '${pkg.name}' for platform '${platform}' into registry '${pkg.registry.name}'`)
        this.logger.debug(`  registry storage URL: '${storageURL}'`)
        this.logger.debug(`  archive to publish: '${archivePath}'`)
        if (signatureSuffixes.length > 0) this.logger.debug(`  detected signatures: '${signatureSuffixes}'`)
        this.logger.debug(`  target package name: '${dstName}'`)

        const s = await storage.initByUrl(storageURL, this.pkg.packageRoot)

        const exists = await s.exists(dstName)
        if (exists) {
            if (options?.skipExisting) {
                this.logger.warn(`software package '${dstName}' already exists in registry '${pkg.registry.name}'. Upload was skipped.`)
                return
            }
            if (!options?.forceReupload) {
                throw new Error(`software package '${dstName}' already exists in registry '${pkg.registry.name}'. To re-upload it, use 'force' flag`)
            }
        }

        const uploads: Promise<void>[] = []

        const archive = fs.createReadStream(archivePath)
        uploads.push(s.putFile(dstName, archive).finally(() => {
            archive.close()
            return
        }))

        for (const sig of signatureSuffixes) {
            const signature = fs.createReadStream(`${archivePath}${sig}`)
            uploads.push(s.putFile(`${dstName}${sig}`, signature).finally(() => {
                signature.close()
                return
            }))
        }

        return Promise.all(uploads).then(
            () => {
                this.logger.info(`Package '${pkg.name}' was published to '${pkg.registry.name}:${dstName}'`)
                return
            }
        )
    }

    public signPackages(options?: {
        ids?: string[],

        archivePath?: string,
        signCommand?: string,
    }) {
        const packagesToSign = options?.ids ?? Array.from(this.buildablePackages.keys())

        if (packagesToSign.length > 1 && options?.archivePath) {
            this.logger.warn("Call of 'sign' action for several packages targeting single package archive.")
        }

        const uploads: Promise<void>[] = []
        for (const pkgID of packagesToSign) {
            const pkg = this.getPackage(pkgID)

            if (pkg.crossplatform) {
                this.signPackage(pkg, util.currentPlatform(), options)
            } else if (this.targetPlatform) {
                this.signPackage(pkg, this.targetPlatform, options)
            } else if (this.allPlatforms) {
                for (const platform of pkg.platforms) {
                    this.signPackage(pkg, platform, options)
                }
            } else {
                this.signPackage(pkg, util.currentPlatform(), options)
            }
        }

        return Promise.all(uploads)
    }

    public signPackage(pkg: PackageConfig, platform: util.PlatformType, options?: {
        archivePath?: string,
        signCommand?: string,
    }) {
        if (!options?.signCommand) {
            throw new Error("current version of pl-package-builder supports only package signature with external utility. Provide 'sign command' option to sign package")
        }
        const signCommand = JSON.parse(options.signCommand)
        const commandFormatIsValid = Array.isArray(signCommand) && signCommand.every(item => typeof item === 'string')
        if (!commandFormatIsValid) {
            throw new Error('sign command must be valid JSON array with command and arguments (["cmd", "arg", "arg", "..."])')
        }

        const { os, arch } = util.splitPlatform(platform)

        const archivePath = options?.archivePath ?? this.binArchivePath(pkg, os, arch)
        const toExecute = signCommand.map((v: string) => v.replaceAll("{pkg}", archivePath))

        this.logger.info(`Signing package '${pkg.name}' for platform '${platform}'...`)
        this.logger.debug(`  archive: '${archivePath}'`)
        this.logger.debug(`  sign command: ${JSON.stringify(toExecute)}`)

        const result = spawnSync(toExecute[0], toExecute.slice(1), { stdio: 'inherit', cwd: this.pkg.packageRoot })
        if (result.error) {
            throw result.error
        }
        if (result.status !== 0) {
            throw new Error(`${JSON.stringify(toExecute)} failed with non-zero exit code`)
        }
    }

    /**
     * Get list of actual signature suffiexes existing for given archive
     */
    private findSignatures(archivePath: string): string[] {
        const signSuffixes: string[] = [".sig", ".p7s"]
        const dirName = path.dirname(archivePath)
        const archiveName = path.basename(archivePath)

        const files = fs.readdirSync(dirName)

        const foundSuffixes: string[] = []
        files.map((fileName: string) => {
            for (const suffix of signSuffixes) {
                if (fileName === `${archiveName}${suffix}`) {
                    foundSuffixes.push(suffix)
                }
            }
        })
        return foundSuffixes
    }

    private get renderer(): Renderer {
        if (!this._renderer) {
            this._renderer = new Renderer(this.logger, this.pkg.packageName, this.pkg.packageRoot)
        }

        return this._renderer
    }

    private archiveOptions(pkg: PackageConfig, os: util.OSType, arch: util.ArchType, archiveType: archive.archiveType): archive.archiveOptions {
        return {
            packageRoot: this.pkg.packageRoot,
            packageName: pkg.name,
            packageVersion: pkg.version,

            crossplatform: pkg.crossplatform,
            os: os,
            arch: arch,
            ext: archiveType,
        }
    }
}
