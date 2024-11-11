import * as fs from 'fs';
import * as path from 'path';
import winston from 'winston';

import { z, ZodError } from 'zod';
import * as util from './util';
import * as envs from './envs';
import * as artifacts from './schemas/artifacts';
import * as entrypoint from './schemas/entrypoint';

export interface PackageArchiveInfo extends artifacts.archiveRules {
    name: string
    version: string
    crossplatform: boolean

    fullName: (platform: util.PlatformType) => string // full package name inside registry (common/corretto/21.2.0.4.1-linux-x64.tgz)
    namePattern: string // address to put into sw.json (common/corretto/21.2.0.4.1-{os}-{arch}.tgz)

    contentRoot: (platform: util.PlatformType) => string // absolute path to package's content root
}

const softwareEntrypointsList = z.record(z.string(), entrypoint.softwareOptionsSchema)
export type SoftwareEntrypoints = z.infer<typeof softwareEntrypointsList>

const environmentEntrypointsList = z.record(z.string(), entrypoint.environmentOptionsSchema)
export type EnvironmentEntrypoints = z.infer<typeof softwareEntrypointsList>

export interface AssetPackage extends artifacts.assetPackageConfig, PackageArchiveInfo {
    type: 'asset'
    registry: artifacts.registry
    name: string
    version: string
    crossplatform: boolean

    isMultiroot: boolean
    contentRoot(platform: util.PlatformType): string
}

export interface RunEnvironmentPackage extends artifacts.environmentConfig, PackageArchiveInfo {
    registry: artifacts.registry,
    name: string
    version: string
    crossplatform: boolean

    isMultiroot: boolean
    contentRoot(platform: util.PlatformType): string
}

export interface BinaryPackage extends artifacts.binaryPackageConfig, PackageArchiveInfo {
    registry: artifacts.registry
    name: string
    version: string
    crossplatform: boolean

    isMultiroot: boolean
    contentRoot(platform: util.PlatformType): string
}
export interface JavaPackage extends artifacts.javaPackageConfig, PackageArchiveInfo {
    registry: artifacts.registry
    name: string
    version: string
    crossplatform: boolean

    isMultiroot: boolean
    contentRoot(platform: util.PlatformType): string
}
export interface PythonPackage extends artifacts.pythonPackageConfig, PackageArchiveInfo {
    registry: artifacts.registry
    name: string
    version: string
    crossplatform: boolean

    isMultiroot: boolean
    contentRoot(platform: util.PlatformType): string
}
export interface RPackage extends artifacts.rPackageConfig, PackageArchiveInfo {
    registry: artifacts.registry
    name: string
    version: string
    crossplatform: boolean

    isMultiroot: boolean
    contentRoot(platform: util.PlatformType): string
}
export interface CondaPackage extends artifacts.condaPackageConfig, PackageArchiveInfo {
    registry: artifacts.registry
    name: string
    version: string
    crossplatform: boolean
}

export type BuildablePackage =
    AssetPackage |
    RunEnvironmentPackage |
    BinaryPackage |
    JavaPackage |
    PythonPackage |
    RPackage
// CondaPackage

export type PackageConfig = BuildablePackage & {
    id: string
    platforms: util.PlatformType[]

    isBuildable: boolean
    isMultiroot: boolean
    contentRoot(platform: util.PlatformType): string
}

export interface AssetEntrypoint {
    type: 'asset'
    name: string
    package: PackageConfig
}

export interface SoftwareEntrypoint {
    type: 'software'
    name: string
    package: PackageConfig
    cmd: string[]
    env: string[]
}

export interface EnvironmentEntrypoint {
    type: 'environment'
    name: string
    package: PackageConfig
    env: string[]
}

export type Entrypoint =
    AssetEntrypoint |
    SoftwareEntrypoint |
    EnvironmentEntrypoint

const storagePresetSchema = z.object({
    downloadURL: z.string().optional(),
    storageURL: z.string().optional(),
})
type storagePreset = z.infer<typeof storagePresetSchema>

const binaryRegistryPresetsSchema = z.record(z.string(), storagePresetSchema)
type binaryRegistryPresets = z.infer<typeof binaryRegistryPresetsSchema>

const packageJsonSchema = z.object({
    name: z.string(),
    version: z.string(),

    "block-software": z.object({
        registries: z.object({
            binary: binaryRegistryPresetsSchema.optional(),
        }).optional(),

        artifacts: artifacts.listSchema.optional(),
        entrypoints: entrypoint.listSchema,
    })
})
type packageJson = z.infer<typeof packageJsonSchema>

const wellKnownRegistries: Record<string, storagePreset> = {
    "platforma-open": {
        downloadURL: 'https://bin.pl-open.science/'
    }
}

/*
 * package.json -> block-software structure example:
 * {
 *   "block-software": {
 *     "registries": {
 *       "binary": {
 *         "default": { "uploadURL": "s3://<bucket>/<some-prefix>?region=<region-name>" }
 *       }
 *     },
 *
 *     "artifacts": {
 *       "pkg-1": {
 *         "type": "binary",
 *         "roots": {
 *           "linux-x64": "./linux-x64/src",
 *           "linux-aarch64": "./linux-aarch/src",
 *           "...and so on...": "platform-dependant roots",
 *         }
 *       }
 *     }
 *
 *     "entrypoints": {
 *       "script1": {
 *         "software": {
 *           "artifact": "pkg-1",
 *           "cmd": [ "{pkg}/script1" ]
 *         }
 *       }
 *     }
 *   }
 * }
 */
export class PackageInfo {
    public readonly packageRoot: string
    public readonly packageName: string

    private readonly pkgJson: packageJson
    private _versionOverride: string | undefined

    constructor(
        private logger: winston.Logger,
        options?: {
            packageRoot?: string,
            pkgJsonData?: string,
        }
    ) {
        this.logger.debug("Reading package information...")

        this.packageRoot = options?.packageRoot ?? util.findPackageRoot(logger)

        if (options?.pkgJsonData) {
            this.pkgJson = parsePackageJson(options.pkgJsonData)
        } else {
            const pkgJsonPath = path.resolve(this.packageRoot, util.packageJsonName)
            this.logger.debug(`  - loading '${pkgJsonPath}'`)
            if (!fs.existsSync(pkgJsonPath)) {
                this.logger.error(`no '${util.packageJsonName}' file found at '${this.packageRoot}'`)
                throw new Error("not a platform software package directory")
            }

            this.pkgJson = readPackageJson(pkgJsonPath)
            this.logger.debug("    " + JSON.stringify(this.pkgJson))
        }

        this.validateConfig()

        this.packageName = this.pkgJson.name

        logger.debug('  package information loaded successfully.')
    }

    get binaryRegistries(): binaryRegistryPresets {
        return this.pkgJson['block-software'].registries?.binary ?? {}
    }

    get entrypoints(): Map<string, Entrypoint> {
        const list = new Map<string, Entrypoint>()

        for (const [epName, ep] of Object.entries(this.pkgJson['block-software'].entrypoints)) {
            if (ep.binary) {
                const packageID = (typeof ep.binary.artifact === 'string') ? ep.binary.artifact : epName
                list.set(epName, {
                    type: 'software',
                    name: epName,
                    package: this.getPackage(packageID),
                    cmd: ep.binary.cmd,
                    env: ep.binary.envVars ?? [],
                })
                continue
            }

            if (ep.environment) {
                const packageID = (typeof ep.environment.artifact === 'string') ? ep.environment.artifact : epName
                list.set(epName, {
                    type: 'environment',
                    name: epName,
                    package: this.getPackage(packageID),
                    env: ep.environment.envVars ?? [],
                })
                continue
            }

            if (ep.asset) {
                const packageID = (typeof ep.asset === 'string') ? ep.asset : epName
                list.set(epName, {
                    type: 'asset',
                    name: epName,
                    package: this.getPackage(packageID),
                })
                continue
            }

            throw new Error(`entrypoint '${epName}' type is not supported by current platforma package builder`)
        }

        return list
    }

    public getEntrypoint(name: string): Entrypoint {
        return this.entrypoints.get(name)!
    }

    // Packages are buildable artifacts with entrypoints
    get packages(): Map<string, PackageConfig> {
        const result = new Map<string, PackageConfig>()

        for (const ep of this.entrypoints.values()) {
            if (!result.has(ep.package.id)) {
                result.set(ep.package.id, ep.package)
            }
        }

        return result
    }

    public getPackage(id: string): PackageConfig {
        const pkgRoot = this.packageRoot
        const artifact = this.getArtifact(id)

        const crossplatform = (artifact.roots !== undefined) ?
            false :
            artifacts.isCrossPlatform(artifact.type)

        return {
            id: id,

            ...artifact,

            registry: this.binRegistryFor(artifact.registry),
            name: this.getName(id, artifact.name),
            version: this.getVersion(artifact.version),
            crossplatform: crossplatform,

            fullName(platform: util.PlatformType): string {
                const ext = artifact.type === 'asset' ? 'zip' : 'tgz'
                return archiveFullName(crossplatform, this.name, this.version, platform, ext)
            },

            get namePattern(): string {
                const ext = artifact.type === 'asset' ? 'zip' : 'tgz'
                return archiveAddressPattern(crossplatform, this.name, this.version, ext)
            },

            get isBuildable(): boolean {
                return artifacts.isBuildable(this.type)
            },

            get isMultiroot(): boolean {
                return Object.keys(this.roots || {}).length > 0
            },

            contentRoot(platform: util.PlatformType): string {
                const root = this.root ?? this.roots?.[platform]
                if (!root) {
                    throw new Error(`root path for software archive of platform ${platform} is undefined for binary package`)
                }

                return path.resolve(pkgRoot, root)
            },

            get platforms(): util.PlatformType[] {
                if (artifact?.root) return [util.currentPlatform()]
                if (artifact?.roots) return Object.keys(artifact.roots) as util.PlatformType[]

                throw new Error(
                    `no platforms are defined as supported for package '${id}' in binary mode ` +
                    `(no 'root' or 'roots' are defined)`)
            }
        }
    }

    private getArtifact(id: string): artifacts.config {
        const artifacts = this.pkgJson['block-software'].artifacts ?? {}
        const entrypoints = this.pkgJson['block-software'].entrypoints

        if (artifacts[id]) {
            return artifacts[id]
        }

        const ep = entrypoints[id]
        if (!ep) {
            throw new Error(`artifact with id '${id}' not found neither in 'entrypoints', nor in 'artifacts'`)
        }

        if (ep.asset && typeof ep.asset !== 'string') {
            return {
                type: 'asset',
                ...ep.asset,
            }
        }

        const idOrArtifact = ep.asset ?? ep.environment?.artifact ?? ep.binary!.artifact

        if (typeof idOrArtifact !== 'string') {
            return idOrArtifact
        }

        if (artifacts[idOrArtifact]) {
            return artifacts[idOrArtifact]
        }

        throw new Error(`entrypoint '${id}' points to artifact '${idOrArtifact}' which does not exist in 'artifacts'`)
    }

    // private getBinary(packageID: string, binSettings: artifacts.config, entrypoints: Record<string, entrypoint.info>): BuildablePackage {
    //     this.logger.debug(`  generating binary config for package`)

    //     const pkgRoot = this.packageRoot
    //     const version = this.getVersion(binSettings.version)

    //     const registry = this.binRegistryFor(binSettings.registry)
    //     const name = this.getName(packageID, binSettings.name)

    //     const binEntrypoints: Record<string, entrypoint.binaryOptions> = {}
    //     for (const [epName, ep] of Object.entries(entrypoints)) {
    //         binEntrypoints[epName] = ep.binary!
    //     }

    //     return {
    //         ...binSettings,

    //         registry,
    //         name,
    //         version,
    //         entrypoints: binEntrypoints,

    //         get crossplatform(): boolean {
    //             if (binSettings.crossplatform !== undefined) {
    //                 return binSettings.crossplatform
    //             }

    //             return binSettings.type === 'java' ||
    //                 binSettings.type === 'python'
    //         },

    //         fullName(platform: util.PlatformType): string {
    //             return binaryPackageFullName(this.crossplatform, this.name, this.version, platform)
    //         },

    //         get namePattern(): string {
    //             return binaryPackageAddressPattern(this.crossplatform, this.name, this.version)
    //         },

    //         contentRoot(platform: util.PlatformType): string {
    //             const root = this.root ?? this.roots?.[platform]
    //             if (!root) {
    //                 throw new Error(`root path for software archive of platform ${platform} is undefined for binary package`)
    //             }

    //             return path.resolve(pkgRoot, root)
    //         }
    //     }
    // }

    // private getEnvironment(packageID: string, envSettings: artifacts.environmentConfig, entrypoints: Record<string, entrypoint.info>): RunEnvironmentPackage {
    //     this.logger.debug("  generating environment config for package")

    //     const pkgRoot = this.packageRoot
    //     const version = this.getVersion(envSettings.version)

    //     const registry = this.binRegistryFor(envSettings.registry)
    //     const name: string = this.getName(packageID, envSettings.name)
    //     const envEntrypoints: Record<string, entrypoint.binaryOptions> = {}
    //     for (const [epName, ep] of Object.entries(entrypoints)) {
    //         envEntrypoints[epName] = ep.binary!
    //     }


    //     return {
    //         ...envSettings,

    //         registry,
    //         name,
    //         version,
    //         entrypoints: envEntrypoints,

    //         crossplatform: envSettings.crossplatform ?? false,

    //         fullName(platform: util.PlatformType): string {
    //             return binaryPackageFullName(this.crossplatform, this.name, this.version, platform)
    //         },

    //         get namePattern(): string {
    //             return binaryPackageAddressPattern(this.crossplatform, this.name, this.version)
    //         },

    //         contentRoot(platform: util.PlatformType): string {
    //             const root = this.root ?? this.roots?.[platform]
    //             if (!root) {
    //                 throw new Error(`root path for software archive of platform ${platform} is undefined for binary package`)
    //             }

    //             return path.resolve(pkgRoot, root)
    //         }
    //     }
    // }

    public set version(v: string | undefined) {
        this._versionOverride = v
    }

    private getVersion(pkgVersion: string | undefined): string {
        if (this._versionOverride) {
            return this._versionOverride
        }

        if (process.env[envs.PL_PKG_VERSION]) {
            return process.env[envs.PL_PKG_VERSION]
        }

        if (pkgVersion) {
            return pkgVersion
        }

        return this.pkgJson.version
    }

    private binRegistryFor(registry: artifacts.registry | string | undefined): artifacts.registry {
        const registries = this.binaryRegistries

        var result: artifacts.registry = {
            name: "default",
            downloadURL: registries.default?.downloadURL,
            storageURL: registries.default?.storageURL,
        }

        if (registry) {
            if (typeof registry === 'string') {
                result.name = registry
                const regDefault = wellKnownRegistries[result.name]
                result.downloadURL = registries[result.name]?.downloadURL ?? regDefault?.downloadURL
                result.storageURL = registries[result.name]?.storageURL ?? regDefault?.storageURL
            } else {
                result.name = registry.name
                const regDefault = wellKnownRegistries[result.name]
                result.downloadURL = registry.downloadURL ?? registries[result.name]?.downloadURL ?? regDefault?.downloadURL
                result.storageURL = registry.storageURL ?? registries[result.name]?.storageURL ?? regDefault?.storageURL
            }
        }

        const regNameUpper = (result.name).toUpperCase().replaceAll(/[^A-Z0-9_]/g, '_')

        const uploadTo = process.env[`PL_REGISTRY_${regNameUpper}_UPLOAD_URL`]
        if (uploadTo) {
            result.storageURL = uploadTo
        }

        const downloadFrom = process.env[`PL_REGISTRY_${regNameUpper}_DOWNLOAD_URL`]
        if (downloadFrom) {
            result.downloadURL = downloadFrom
        }

        if (result.downloadURL) {
            const u = new URL(result.downloadURL, 'file:/nonexistent') // check download URL is valid URL
            if (!['https:', 'http:'].includes(u.protocol)) {
                throw new Error(`registry ${result.name} download URL is not valid. Only 'https://' and 'http://' schemes are supported for now`)
            }
        }

        return result
    }

    private validateConfig() {
        var hasErrors: boolean = false

        const blockSoftware = this.pkgJson['block-software']

        const as = blockSoftware.artifacts ?? {}
        const entrypoints = blockSoftware.entrypoints ?? {}

        for (const [epName, ep] of Object.entries(entrypoints)) {
            if (ep.binary) {
                const artifactName = (typeof ep.binary.artifact === 'string') ? ep.binary.artifact : epName
                const artifact = this.getArtifact(artifactName)

                if (!artifact) {
                    this.logger.error(
                        `entrypoint '${epName}' refers to artifact '${ep.binary.artifact}' which is not defined in '${util.softwareConfigName}'`
                    )
                    hasErrors = true
                }

                if (!this.validateArtifact(artifactName, artifact)) {
                    hasErrors = true
                }

                if (!artifacts.isBuildable(artifact.type)) {
                    this.logger.error(
                        `entrypoint '${epName}' artifact type '${artifact.type}' is not buildable to binary package`
                    )
                    hasErrors = true
                }

                if (artifact.type === 'environment') {
                    this.logger.error(
                        `entrypoint '${epName}' artifact type '${artifact.type}' cannot be build into software pacakge. Use 'environment' entrypoint`
                    )
                    hasErrors = true
                }
            }

            if (ep.environment) {
                const artifactName = (typeof ep.environment.artifact === 'string') ? ep.environment.artifact : epName
                const artifact = this.getArtifact(artifactName)

                if (!artifact) {
                    this.logger.error(
                        `entrypoint '${epName}' refers to artifact '${ep.environment.artifact}' which is not defined in '${util.softwareConfigName}'`
                    )
                    hasErrors = true
                }

                if (!this.validateArtifact(artifactName, artifact)) {
                    hasErrors = true
                }

                if (artifact.type !== 'environment') {
                    this.logger.error(
                        `entrypoint '${epName}' with 'environment' settings should refer to 'environment' artifact type`
                    )
                    hasErrors = true
                }
            }

            // TODO: add docker validation here
        }

        const uniquePackageNames = new Set<string>()

        for (const [artifactName, artifact] of Object.entries(as)) {
            if (!artifacts.isBuildable(artifact.type)) {
                continue
            }

            if (!this.validateArtifact(artifactName, artifact)) {
                hasErrors = true
            }


            const name = this.getName(artifactName, artifact.name)
            const version = this.getVersion(artifact.version)
            const uniqueName = `${name}-${version}`
            if (uniquePackageNames.has(uniqueName)) {
                this.logger.error(`found two packages with the same name '${name}' and version '${version}'`)
                hasErrors = true
            }

            uniquePackageNames.add(uniqueName)
        }

        if (hasErrors) {
            throw new Error(`${util.softwareConfigName} has xconfiguration errors in 'block-software' section. See error log messages above for details`)
        }
    }

    private validateArtifact(artifactName: string, artifact: artifacts.config): boolean {
        if (artifacts.isBuildable(artifact.type)) {
            if (artifact.root && artifact.roots) {
                this.logger.error(`${artifact.type} artifact '${artifactName}' has both 'root' and 'roots' options. 'root' and 'roots' are mutually exclusive.`)

                return false
            }
        }

        return true
    }

    private getName(artifactName: string, name?: string): string {
        if (name) {
            return name
        }

        return util.trimPrefix(this.pkgJson.name, "@") + "/" + artifactName
    }
}

const readPackageJson = (filePath: string) => parsePackageJson(fs.readFileSync(filePath, 'utf8'));
function parsePackageJson(data: string) {
    const parsedData = JSON.parse(data)
    // TODO: try/catch and transform errors on human-readable format
    return packageJsonSchema.parse(parsedData) as packageJson;
}

function archiveFullName(crossplatform: boolean, name: string, version: string, platform: util.PlatformType, extension: string): string {
    if (crossplatform) {
        return `${name}/${version}.${extension}`
    }

    const { os, arch } = util.splitPlatform(platform)
    return `${name}/${version}-${os}-${arch}.${extension}`
}

function archiveAddressPattern(crossplatform: boolean, name: string, version: string, extension: string): string {
    if (crossplatform) {
        return `${name}/${version}.${extension}`
    }

    return `${name}/${version}-{os}-{arch}.${extension}`
}
