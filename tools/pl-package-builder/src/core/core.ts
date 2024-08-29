import fs from 'fs';
import path from 'path';
import { spawnSync } from "child_process";
import winston from "winston";
import { PackageInfo, PackageConfig } from "./package-info";
import { Renderer, listSoftwareNames as listSoftwareEntrypoints, readEntrypointDescriptor } from "./renderer";
import * as binSchema from './schemas/binary';
import * as util from "./util";
import * as archive from "./archive";
import * as storage from "./storage";

export class Core {
    private readonly logger: winston.Logger
    private _packages: Map<string, PackageConfig> | undefined
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

    public archivePath(pkg: PackageConfig, os: util.OSType, arch: util.ArchType): string {
        return archive.getPath(this.archiveOptions(pkg, os, arch))
    }

    public get packages(): Map<string, PackageConfig> {
        if (!this._packages) {
            this._packages = this.pkg.packages
        }

        return this._packages
    }

    public get buildablePackages(): Map<string, PackageConfig> {
        return new Map(
            Array.from(this.packages.entries())
                .filter(([, value]) => value.buildable)
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
        for (const [id, pkg] of this.packages.entries()) {
            if (options?.ids && !options.ids.includes(id)) {
                this.logger.debug(`skipping descriptor generation for package '${id}'`)
                continue
            }

            const infos = this.renderer.renderSoftwareEntrypoints(this.buildMode, pkg, {
                entrypoints: options?.entrypoints,
                sources: options?.sources,
                fullDirHash: this.fullDirHash
            })

            for (const swJson of infos.values()) {
                this.renderer.writeEntrypointDescriptor(swJson)
            }
        }
    }

    public buildPackages(options?: {
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
                this.buildPackage(pkg, util.currentPlatform(), options)
            } else if (this.targetPlatform) {
                this.buildPackage(pkg, this.targetPlatform, options)
            } else if (this.allPlatforms && !pkg.isMultiRoot) {
                const currentPlatform = util.currentPlatform()
                this.logger.warn(
                    `packages are requested to be build for all supported platforms, but package '${pkgID}' has single archive root for all platforms and will be built only for '${currentPlatform}'`,
                )
                this.buildPackage(pkg, currentPlatform, options)
            } else if (this.allPlatforms) {
                for (const platform of pkg.platforms) {
                    this.buildPackage(pkg, platform, options)
                }
            } else {
                this.buildPackage(pkg, util.currentPlatform(), options)
            }
        }
    }

    public buildPackage(pkg: PackageConfig, platform: util.PlatformType, options?: {
        archivePath?: string, contentRoot?: string,
        skipIfEmpty?: boolean,
    }) {
        this.logger.info(`Building software package '${pkg.id}' for platform '${platform}'...`)
        const { os, arch } = util.splitPlatform(platform)

        if (!pkg.binary && !pkg.environment) {
            if (options?.skipIfEmpty) {
                this.logger.info(`  archive build was skipped: package '${pkg.id}' has no software archive build settings ('binary' or 'environment')`)
            }
            this.logger.error(`  no 'binary' settings found: software '${pkg.id}' archive build is impossible for configuration inside '${util.softwareConfigName}'`)
            throw new Error("no 'binary' configuration")
        }

        if (this.buildMode === 'dev-local') {
            this.logger.info(`  no need to build software archive in '${this.buildMode}' mode: archive build was skipped`)
            return
        }

        const descriptor = pkg.environment ?? pkg.binary!
        const archivePath = options?.archivePath ?? this.archivePath(pkg, os, arch)
        const contentRoot = options?.contentRoot ?? descriptor.contentRoot(platform)

        this.logger.debug("  rendering 'package.sw.json' to be embedded into package archive")
        const swJson = this.renderer.renderPackageDescriptor(this.buildMode, pkg)

        const swJsonPath = path.resolve(contentRoot, "package.sw.json")
        fs.writeFileSync(swJsonPath, JSON.stringify(swJson))

        this.logger.info("  packing software into a package")
        if (descriptor.crossplatform) {
            this.logger.info(`    generating cross-platform package`)
        } else {
            this.logger.info(`    generating package for os='${os}', arch='${arch}'`)
        }
        this.logger.debug(`    package content root: '${contentRoot} '`)
        this.logger.debug(`    package destination archive: '${archivePath}'`)

        archive.create(contentRoot, archivePath)

        this.logger.info(`  software package was written to '${archivePath}'`)
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

        const descriptor = pkg.environment ?? pkg.binary!
        const storageSettings = getStorageSettings({
            customStorageURL: options?.storageURL,
            registry: descriptor.registry,
            pkgInfo: this.pkg,
        })

        const archivePath = options?.archivePath ?? this.archivePath(pkg, os, arch)
        const storageURL = storageSettings.UploadURL
        const dstName = descriptor.fullName(platform)

        if (!storageURL) {
            this.logger.error(`no storage URL is set for registry ${descriptor.registry.name}`)
            if (pkg.environment) {
                throw new Error(`environment.registry.storageURL of package '${pkg.id}' is empty. Set it as command option or in '${util.softwareConfigName}' file`)
            }

            throw new Error(`binary.registry.storageURL of package '${pkg.id}' is empty. Set it as command option or in '${util.softwareConfigName}' file`)
        }

        const signatureSuffixes = this.findSignatures(archivePath)

        this.logger.info(`Publishing package '${descriptor.name}' for platform '${platform}' into registry '${descriptor.registry.name}'`)
        this.logger.debug(`  registry storage URL: '${storageURL}'`)
        this.logger.debug(`  archive to publish: '${archivePath}'`)
        if (signatureSuffixes.length > 0) this.logger.debug(`  detected signatures: '${signatureSuffixes}'`)
        this.logger.debug(`  target package name: '${dstName}'`)

        const s = storage.initByUrl(storageURL, this.pkg.packageRoot)

        const exists = await s.exists(dstName)
        if (exists) {
            if (options?.skipExisting) {
                this.logger.warn(`software package '${dstName}' already exists in registry '${descriptor.registry.name}'. Upload was skipped.`)
                return
            }
            if (!options?.forceReupload) {
                throw new Error(`software package '${dstName}' already exists in registry '${descriptor.registry.name}'. To re-upload it, use 'force' flag`)
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
                this.logger.info(`Package '${descriptor.name}' was published to '${descriptor.registry.name}:${dstName}'`)
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

        const descriptor = pkg.environment ?? pkg.binary!

        const archivePath = options?.archivePath ?? this.archivePath(pkg, os, arch)

        this.logger.info(`Signing package '${descriptor.name}' for platform '${platform}'...`)
        this.logger.debug(`  archive: '${archivePath}'`)
        this.logger.debug(`  sign command: '${signCommand}'`)

        const toExecute = signCommand.map((v: string) => v.replaceAll("{pkg}", archivePath))

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

    private archiveOptions(pkg: PackageConfig, os: util.OSType, arch: util.ArchType): archive.archiveOptions {
        const desc = pkg.environment ?? pkg.binary!

        return {
            packageRoot: this.pkg.packageRoot,
            packageName: desc.name,
            packageVersion: desc.version,

            crossplatform: desc.crossplatform,
            os: os,
            arch: arch,
        }
    }
}

type storageSettings = {
    UploadURL?: string
}

function getStorageSettings(options?: {
    customStorageURL?: string,
    registry?: { name: string, storageURL?: string },
    pkgInfo?: PackageInfo,
}): storageSettings {
    const settings: storageSettings = {}

    // Priorities (from highes to lowest):
    //  <customStorageURL> ->
    //    <environment variable> ->
    //      <package registry settings> ->
    //        <registry catalog in package.json>

    const regNameUpper = (options?.registry?.name ?? "").toUpperCase()

    if (options?.pkgInfo && options.registry?.name) {
        const preset = options.pkgInfo.binaryRegistries[options.registry?.name]
        if (preset) {
            settings.UploadURL = preset.storageURL
        }
    }

    if (options?.registry?.storageURL) {
        settings.UploadURL = options?.registry?.storageURL
    }

    if (options?.registry?.name) {
        const uploadTo = process.env[`PL_REGISTRY_${regNameUpper}_UPLOAD_URL`]
        if (uploadTo) {
            settings.UploadURL = uploadTo
        }
    }

    if (options?.customStorageURL) {
        settings.UploadURL = options.customStorageURL
    }

    return settings
}
