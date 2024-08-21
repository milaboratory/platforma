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
import { ArchType, currentArch, currentOS, OSType } from "./util";
import { createReadStream } from "fs";

export class Core {
    private readonly logger: winston.Logger
    private _packages: Map<string, PackageConfig> | undefined
    private _renderer: Renderer | undefined

    public readonly pkg: PackageInfo
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

        this.buildMode = 'release'
        this.targetOS = currentOS()
        this.targetArch = currentArch()

        this.fullDirHash = false
    }

    public archivePath(pkgID: string): string {
        return archive.getPath(this.archiveOptions(pkgID))
    }

    public get packages(): Map<string, PackageConfig> {
        if (!this._packages) {
            this._packages = this.pkg.packages
        }

        return this._packages
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
        const packagesToBuild = options?.ids ?? Array.from(this.packages.keys())

        if (packagesToBuild.length > 1 && options?.archivePath && !options.forceBuild) {
            this.logger.error("Attempt to build several packages targeting single package archive. This will simply overwrite the archive several times. If you know what you are doing, add '--force' flag")
            throw new Error("attempt to build several packages using the same software package archive")
        }

        for (const pkgID of packagesToBuild) {
            this.buildPackage(pkgID, options)
        }
    }

    public buildPackage(pkgID: string, options?: {
        archivePath?: string, contentRoot?: string,
        skipIfEmpty?: boolean,
    }) {
        this.logger.info(`Building software package '${pkgID}'...`)
        const pkg = this.getPackage(pkgID)

        if (!pkg.binary && !pkg.environment) {
            if (options?.skipIfEmpty) {
                this.logger.info(`  archive build was skipped: package '${pkgID}' has no software archive build settings ('binary' or 'environment')`)
            }
            this.logger.error(`  no 'binary' settings found: software '${pkgID}' archive build is impossible for configuration inside '${util.softwareConfigName}'`)
            throw new Error("no 'binary' configuration")
        }

        if (this.buildMode === 'dev-local') {
            this.logger.info(`  no need to build software archive in '${this.buildMode}' mode: archive build was skipped`)
            return
        }

        const descriptor = pkg.environment ?? pkg.binary!
        const archivePath = options?.archivePath ?? this.archivePath(pkgID)
        const contentRoot = options?.contentRoot ?? descriptor.root

        this.logger.info("  rendering 'package.sw.json' to be embedded into package archive")
        const swJson = this.renderer.renderPackageDescriptor(this.buildMode, pkg)

        const swJsonPath = path.resolve(contentRoot, "package.sw.json")
        fs.writeFileSync(swJsonPath, JSON.stringify(swJson))

        this.logger.info("  packing software into a package")
        if (descriptor.crossplatform) {
            this.logger.info(`    generating cross-platform package`)
        } else {
            this.logger.info(`    generating package for os='${this.targetOS}', arch='${this.targetArch}'`)
        }
        this.logger.debug(`    package content root: '${contentRoot} '`)
        this.logger.debug(`    package destination archive: '${archivePath}'`)

        archive.create(contentRoot, this.archivePath(pkgID))

        this.logger.info(`  software package was written to '${this.archivePath(pkgID)}'`)
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
        forcePublish?: boolean,
        forceReupload?: boolean,

        archivePath?: string,
        storageURL?: string,
    }) {
        const packagesToPublish = options?.ids ?? Array.from(this.packages.keys())

        if (packagesToPublish.length > 1 && options?.archivePath && !options.forcePublish) {
            this.logger.error("Attempt to publish several pacakges using single package archive. This will upload the same archive under several different names. If you know what you are doing, add '--force' flag")
            throw new Error("attempt to publish several packages using the same software package archive")
        }

        const uploads: Promise<void>[] = []
        for (const pkgID of packagesToPublish) {
            uploads.push(this.publishPackage(pkgID, options))
        }

        return Promise.all(uploads)
    }

    public async publishPackage(pkgID: string, options?: {
        archivePath?: string,
        storageURL?: string,
        forceReupload?: boolean
    }) {
        const pkg = this.getPackage(pkgID)
        const descriptor = pkg.environment ?? pkg.binary!
        const storageSettings = getStorageSettings({
            customStorageURL: options?.storageURL,
            registry: descriptor.registry,
            pkgInfo: this.pkg,
        })

        const archivePath = options?.archivePath ?? this.archivePath(pkgID)
        const storageURL = storageSettings.UploadURL
        const dstName = descriptor.fullName(this.targetOS, this.targetArch)

        if (!storageURL) {
            this.logger.error(`no storage URL is set for registry ${descriptor.registry.name}`)
            if (pkg.environment) {
                throw new Error(`environment.registry.storageURL of package '${pkgID}' is empty. Set it as command option or in '${util.softwareConfigName}' file`)
            }

            throw new Error(`binary.registry.storageURL of package '${pkgID}' is empty. Set it as command option or in '${util.softwareConfigName}' file`)
        }

        this.logger.info(`Publishing package '${descriptor.name}' into registry '${descriptor.registry.name}'`)
        this.logger.debug(`  registry storage URL: '${storageURL}'`)
        this.logger.debug(`  archive to publish: '${archivePath}'`)
        this.logger.debug(`  target package name: '${dstName}'`)

        const s = storage.initByUrl(storageURL, this.pkg.packageRoot)

        const exists = await s.exists(dstName)
        if (exists && !options?.forceReupload) {
            throw new Error(`software package '${dstName}' already exists in registry '${descriptor.registry.name}'. To re-upload it, use 'force' flag`)
        }

        const archive = createReadStream(this.archivePath(pkgID))
        s.putFile(dstName, archive).then(
            () => this.logger.info(`Package '${descriptor.name}' was published to '${descriptor.registry.name}:${dstName}'`)
        )
    }

    private get renderer(): Renderer {
        if (!this._renderer) {
            this._renderer = new Renderer(this.logger, this.pkg.packageName, this.pkg.packageRoot)
        }

        return this._renderer
    }

    private archiveOptions(pkgID: string): archive.archiveOptions {
        const pkg = this.getPackage(pkgID)
        const desc = pkg.environment ?? pkg.binary!

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

type storageSettings = {
    UploadURL?: string
}

function getStorageSettings(options?: {
    customStorageURL?: string,
    registry?: {name: string, storageURL?: string},
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
