import * as fs from 'fs';
import * as path from 'path';
import winston from 'winston';

import { z, ZodError } from 'zod';
import * as util from './util';
import * as envs from './envs';
import * as binary from './schemas/binary';
import * as entrypoint from './schemas/entrypoint';

export interface PackageArchiveInfo extends binary.archiveRules {
    name: string
    version: string
    crossplatform: boolean

    fullName: (platform: util.PlatformType) => string // full package name inside registry (common/corretto/21.2.0.4.1-linux-x64.tgz)
    namePattern: string // address to put into sw.json (common/corretto/21.2.0.4.1-{os}-{arch}.tgz)

    contentRoot: (platform: util.PlatformType) => string // absolute path to package's content root
}

const binaryEntrypointsList = z.record(z.string(), entrypoint.binaryOptionsSchema)
export type BinaryEntrypoints = z.infer<typeof binaryEntrypointsList>

export interface BinaryConfig extends binary.binaryPackageConfig, PackageArchiveInfo {
    registry: binary.registry
    name: string
    version: string
    crossplatform: boolean
    entrypoints: BinaryEntrypoints
}
export interface JavaConfig extends binary.javaPackageConfig, PackageArchiveInfo {
    registry: binary.registry
    name: string
    version: string
    crossplatform: boolean
    entrypoints: BinaryEntrypoints
}
export interface PythonConfig extends binary.pythonPackageConfig, PackageArchiveInfo {
    registry: binary.registry
    name: string
    version: string
    crossplatform: boolean
    entrypoints: BinaryEntrypoints
}
export interface RConfig extends binary.rPackageConfig, PackageArchiveInfo {
    registry: binary.registry
    name: string
    version: string
    crossplatform: boolean
    entrypoints: BinaryEntrypoints
}
export interface CondaConfig extends binary.condaPackageConfig, PackageArchiveInfo {
    registry: binary.registry
    name: string
    version: string
    crossplatform: boolean
    entrypoints: BinaryEntrypoints
}

export type BinaryPackage =
    BinaryConfig |
    JavaConfig |
    PythonConfig
// RConfig
// CondaConfig

export interface RunEnvironment extends binary.environmentConfig, PackageArchiveInfo {
    registry: binary.registry,
    name: string
    version: string
    crossplatform: boolean
    entrypoints: BinaryEntrypoints
}

export interface PackageConfig {
    id: string
    binary?: BinaryPackage
    environment?: RunEnvironment
    buildable: boolean

    crossplatform: boolean
    isMultiRoot: boolean
    platforms: util.PlatformType[]
    contentRoot(platform: util.PlatformType): string
}

const artifactDefinitionSchema = z.object({
    // docker: dockerConfigSchema.optional(),
    binary: binary.configSchema.optional(),
    environment: binary.environmentConfigSchema.optional(),
}).refine(
    data => (
        !((data.binary && data.environment) || (!data.binary && !data.environment))
    ),
    {
        message: "software package can provide either binary for execution, either execution environment. Never both",
        path: ['binary', 'environment']
    }
)

const storagePresetSchema = z.object({
    storageURL: z.string()
})

const binaryRegistryPresetsSchema = z.record(z.string(), storagePresetSchema)
type binaryRegistryPresets = z.infer<typeof binaryRegistryPresetsSchema>

const packageJsonSchema = z.object({
    name: z.string(),
    version: z.string(),

    "block-software": z.object({
        registries: z.object({
            binary: binaryRegistryPresetsSchema.optional(),
        }).optional(),

        artifacts: z.record(z.string(), artifactDefinitionSchema),

        entrypoints: entrypoint.listSchema.optional(),
    })
})
type packageJson = z.infer<typeof packageJsonSchema>

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
 *         "binary": {
 *           "roots": {
 *             "linux-x64": "./linux-x64/src",
 *             "linux-aarch64": "./linux-aarch/src",
 *             "...and so on...": "platform-dependant roots",
 *           }
 *         }
 *       }
 *     }
 *
 *     "entrypoints": {
 *       "script1": {
 *         "artifact": "pkg-1",
 *         "binary": {
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

    getEntrypoints(pkgID: string): Record<string, entrypoint.info> {
        const list: Record<string, entrypoint.info> = {}

        for (const [epName, ep] of Object.entries(this.pkgJson['block-software'].entrypoints ?? {})) {
            if (ep.artifact === pkgID) {
                list[epName] = ep
            }
        }

        return list
    }

    // Packages are buildable artifacts with entrypoints
    get packages(): Map<string, PackageConfig> {
        const result = new Map<string, PackageConfig>()

        for (const [epName, ep] of Object.entries(this.pkgJson['block-software'].entrypoints ?? {})) {
            if (!ep.binary) {
                continue
            }

            if (!result.has(ep.artifact)) {
                result.set(ep.artifact, this.getPackage(ep.artifact))
            }
        }

        return result
    }

    getPackage(id: string): PackageConfig {
        const artifact = this.pkgJson['block-software'].artifacts[id]

        if (!artifact) {
            this.logger.error(`artifact '${id}' not found in ${util.softwareConfigName} file`)
            throw new Error(`no artifact with id '${id}'`)
        }

        if (!artifact.binary && !artifact.environment) {
            this.logger.error(`artifact '${id}' is refered as binary entrypoint but has no 'binary' or 'environment' configuration`)
        }

        const entrypoints = this.getEntrypoints(id)

        const binary = (artifact.binary) ? this.getBinary(id, artifact.binary, entrypoints) : undefined
        const environment = (artifact.environment) ? this.getEnvironment(id, artifact.environment, entrypoints) : undefined

        return {
            id: id,
            binary,
            environment,

            buildable: Boolean(binary || environment),

            get crossplatform(): boolean {
                if (binary) return binary.crossplatform
                if (environment) return environment.crossplatform
                return false
            },

            get isMultiRoot(): boolean {
                if (binary) return binary.roots !== undefined
                if (environment) return environment.roots !== undefined
                return false
            },

            get platforms(): util.PlatformType[] {
                if (binary?.root) return [util.currentPlatform()]
                if (binary?.roots) return Object.keys(binary.roots) as util.PlatformType[]

                if (environment?.root) return [util.currentPlatform()]
                if (environment?.roots) return Object.keys(environment.roots) as util.PlatformType[]

                throw new Error(`no platforms are defined as supported for package '${id}' in binary mode (no 'root' or 'roots' are defined)`)
            },

            contentRoot(platform: util.PlatformType): string {
                if (binary) return binary.contentRoot(platform)
                if (environment) return environment.contentRoot(platform)

                throw new Error(`root path for software archive is undefined for package ${id}`)
            }
        }
    }

    private getBinary(packageID: string, binSettings: binary.config, entrypoints: Record<string, entrypoint.info>): BinaryPackage {
        this.logger.debug(`  generating binary config for package`)

        const pkgRoot = this.packageRoot
        const version = this.getVersion(binSettings.version)

        const registry = this.binRegistryFor(binSettings.registry)
        const name = this.getName(packageID, binSettings.name)

        const binEntrypoints: Record<string, entrypoint.binaryOptions> = {}
        for (const [epName, ep] of Object.entries(entrypoints)) {
            binEntrypoints[epName] = ep.binary!
        }

        return {
            ...binSettings,

            registry,
            name,
            version,
            entrypoints: binEntrypoints,

            get crossplatform(): boolean {
                if (binSettings.crossplatform !== undefined) {
                    return binSettings.crossplatform
                }

                return binSettings.type === 'java' ||
                    binSettings.type === 'python'
            },

            fullName(platform: util.PlatformType): string {
                return binaryPackageFullName(this.crossplatform, this.name, this.version, platform)
            },

            get namePattern(): string {
                return binaryPackageAddressPattern(this.crossplatform, this.name, this.version)
            },

            contentRoot(platform: util.PlatformType): string {
                const root = this.root ?? this.roots?.[platform]
                if (!root) {
                    throw new Error(`root path for software archive of platform ${platform} is undefined for binary package`)
                }

                return path.resolve(pkgRoot, root)
            }
        }
    }

    private getEnvironment(packageID: string, envSettings: binary.environmentConfig, entrypoints: Record<string, entrypoint.info>): RunEnvironment {
        this.logger.debug("  generating environment config for package")

        const pkgRoot = this.packageRoot
        const version = this.getVersion(envSettings.version)

        const registry = this.binRegistryFor(envSettings.registry)
        const name: string = this.getName(packageID, envSettings.name)
        const envEntrypoints: Record<string, entrypoint.binaryOptions> = {}
        for (const [epName, ep] of Object.entries(entrypoints)) {
            envEntrypoints[epName] = ep.binary!
        }


        return {
            ...envSettings,

            registry,
            name,
            version,
            entrypoints: envEntrypoints,

            crossplatform: envSettings.crossplatform ?? false,

            fullName(platform: util.PlatformType): string {
                return binaryPackageFullName(this.crossplatform, this.name, this.version, platform)
            },

            get namePattern(): string {
                return binaryPackageAddressPattern(this.crossplatform, this.name, this.version)
            },

            contentRoot(platform: util.PlatformType): string {
                const root = this.root ?? this.roots?.[platform]
                if (!root) {
                    throw new Error(`root path for software archive of platform ${platform} is undefined for binary package`)
                }

                return path.resolve(pkgRoot, root)
            }
        }
    }

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

    private binRegistryFor(registry?: binary.registry): binary.registry {
        const registries = this.pkgJson['block-software'].registries ?? {}

        var result: binary.registry = {
            name: "default",
            storageURL: registries.binary?.default?.storageURL
        }

        if (registry) {
            result = registry
        }

        const regNameUpper = (result.name).toUpperCase()

        const uploadTo = process.env[`PL_REGISTRY_${regNameUpper}_UPLOAD_URL`]
        if (uploadTo) {
            result.storageURL = uploadTo
        }

        return result
    }

    private validateConfig() {
        var hasErrors: boolean = false

        const blockSoftware = this.pkgJson['block-software']

        const artifacts = blockSoftware.artifacts ?? {}
        const entrypoints = blockSoftware.entrypoints ?? {}

        for (const [epName, ep] of Object.entries(entrypoints)) {
            const artifact = artifacts[ep.artifact]
            if (!artifact) {
                this.logger.error(
                    `entrypoint '${epName}' refers artifact '${ep.artifact}' which is not defined in '${util.softwareConfigName}'`
                )
                hasErrors = true
            }
            if (ep.binary && !artifact.binary && !artifact.environment) {
                this.logger.error(
                    `entrypoint '${epName}' declares 'binary' settings for artifact '${ep.artifact}' with no 'binary' or 'environment' configuration`
                )
                hasErrors = true
            }

            // TODO: add docker validation here
        }

        const uniquePackageNames = new Set<string>()

        for (const [artifactName, artifact] of Object.entries(artifacts)) {
            const binConfig = artifact.binary ?? artifact.environment
            if (binConfig) {
                if (binConfig.root && binConfig.roots) {
                    this.logger.error(`binary package '${artifactName}' has both 'root' and 'roots' options. 'root' and 'roots' are mutually exclusive.`)
                    hasErrors = true
                }

                const name = this.getName(artifactName, binConfig.name)
                const version = this.getVersion(binConfig.version)
                const uniqueName = `${name}-${version}`
                if (uniquePackageNames.has(uniqueName)) {
                    this.logger.error(`found two packages with the same name '${name}' and version '${version}'`)
                    hasErrors = true
                }
                uniquePackageNames.add(uniqueName)
            }
        }

        if (hasErrors) {
            throw new Error(`${util.softwareConfigName} has xconfiguration errors in 'block-software' section. See error log messages above for details`)
        }
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

function binaryPackageFullName(crossplatform: boolean, name: string, version: string, platform: util.PlatformType): string {
    if (crossplatform) {
        return `${name}/${version}.tgz`
    }

    const { os, arch } = util.splitPlatform(platform)
    return `${name}/${version}-${os}-${arch}.tgz`
}

function binaryPackageAddressPattern(crossplatform: boolean, name: string, version: string): string {
    if (crossplatform) {
        return `${name}/${version}.tgz`
    }

    return `${name}/${version}-{os}-{arch}.tgz`
}
