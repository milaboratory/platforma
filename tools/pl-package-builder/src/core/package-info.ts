import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import winston from 'winston';

import { z } from 'zod';
import * as util from './util';
import * as envs from './envs';
import * as binary from './schemas/binary';
import { boolean } from '@oclif/core/lib/flags';

export interface PackageArchiveInfo extends binary.archiveRules {
    name: string
    version: string
    crossplatform: boolean

    fullName: (platform: util.PlatformType) => string // full package name inside registry (common/corretto/21.2.0.4.1-linux-x64.tgz)
    namePattern: string // address to put into sw.json (common/corretto/21.2.0.4.1-{os}-{arch}.tgz)

    contentRoot: (platform: util.PlatformType) => string // absolute path to package's content root
}

export interface BinaryConfig extends binary.binaryPackageConfig, PackageArchiveInfo {
    name: string
    version: string
    crossplatform: boolean
}
export interface JavaConfig extends binary.javaPackageConfig, PackageArchiveInfo {
    name: string
    version: string
    crossplatform: boolean
}
export interface PythonConfig extends binary.pythonPackageConfig, PackageArchiveInfo {
    name: string
    version: string
    crossplatform: boolean
}
export interface RConfig extends binary.rPackageConfig, PackageArchiveInfo {
    name: string
    version: string
    crossplatform: boolean
}
export interface CondaConfig extends binary.condaPackageConfig, PackageArchiveInfo {
    name: string
    version: string
    crossplatform: boolean
}

export type BinaryPackage =
    BinaryConfig |
    JavaConfig |
    PythonConfig |
    RConfig |
    CondaConfig

export interface RunEnvironment extends binary.environmentConfig, PackageArchiveInfo {
    name: string
    version: string
    crossplatform: boolean
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

const packageConfigSchema = z.object({
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
    storageURL: z.string().optional()
})

const binaryRegistryPresetsSchema = z.record(z.string(), storagePresetSchema)
type binaryRegistryPresets = z.infer<typeof binaryRegistryPresetsSchema>

const packageJsonSchema = z.object({
    name: z.string(),
    version: z.string(),

    "block-software": z.object({
        registries: z.object({
            binary: binaryRegistryPresetsSchema.optional()
        }).optional(),

        packages: z.record(z.string(), packageConfigSchema)
    })
})
type packageJson = z.infer<typeof packageJsonSchema>

/*
 * package.json -> block-software structure example:
 * {
 *   "block-software": {
 *     "registries": {
 *       "binary": {
 *         "my-org": {"uploadURL": "s3://<bucket>/<some-prefix>?region=<region-name>"}
 *       }
 *     },
 *     "packages": {
 *       "binary": {
 *         "registry": {
 *            "name": "my-org"
 *         },
 *
 *         "root": "./src",
 *         "roots": {
 *           "linux-x64": "./linux-x64/src",
 *           "linux-aarch64": "./linux-aarch/src",
 *           "...and so on...": "platform-dependant roots",
 *         }
 *
 *         "entrypoints": {
 *           "script1": {
 *             "cmd": [ "{pkg}/script1" ]
 *           }
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

    get packages(): Map<string, PackageConfig> {
        const result = new Map<string, PackageConfig>()

        for (const k of Object.keys(this.pkgJson['block-software'].packages)) {
            result.set(k, this.getPackage(k))
        }

        return result
    }

    getPackage(id: string): PackageConfig {
        const pkgInfo = this.pkgJson['block-software'].packages[id]

        if (!pkgInfo) {
            this.logger.error(`package with id '${id}' not found in ${util.softwareConfigName} file`)
            throw new Error(`no package with id '${id}'`)
        }

        const binary = (pkgInfo.binary) ? this.getBinary(pkgInfo.binary) : undefined
        const environment = (pkgInfo.environment) ? this.getEnvironment(pkgInfo.environment) : undefined

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

    private getBinary(binSettings: binary.config): BinaryPackage {
        this.logger.debug(`  generating binary config for package`)

        const pkgRoot = this.packageRoot
        const version = this.getVersion(binSettings.version)

        const registry = binSettings.registry
        const name = this.getName(binSettings.name)

        return {
            ...binSettings,

            registry,
            name,
            version,

            get crossplatform(): boolean {
                if (binSettings.crossplatform !== undefined) {
                    return binSettings.crossplatform
                }

                return binSettings.type === 'java' ||
                    binSettings.type === 'python' ||
                    binSettings.type === 'R'
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

    private getEnvironment(envSettings: binary.environmentConfig): RunEnvironment {
        this.logger.debug("  generating environment config for package")

        const pkgRoot = this.packageRoot
        const version = this.getVersion(envSettings.version)

        const registry = envSettings.registry
        const name: string = this.getName(envSettings.name)

        return {
            ...envSettings,

            registry,
            name,
            version,

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

    private validateConfig() {
        const blockSoftware = this.pkgJson['block-software']
        const packages = blockSoftware.packages
        var canHaveDefaultName = true

        const uniqueEntrypoints: Record<string, string> = {}
        const uniquePackageNames = new Set<string>()

        for (const [pkgID, pkg] of Object.entries(packages)) {
            const binConfig = pkg.binary

            if (binConfig) {
                if (!binConfig.name) {
                    if (!canHaveDefaultName) {
                        throw new Error(`Several packages are defined in '${util.softwareConfigName}'. Only one software package can have empty 'name' field`)
                    }
                    canHaveDefaultName = false
                }

                const name = this.getName(binConfig.name)
                const version = this.getVersion(binConfig.version)
                const uniqueName = `${name}-${version}`
                if (uniquePackageNames.has(uniqueName)) {
                    throw new Error(`found two packages with the same name '${name}' and version '${version}'`)
                }
                uniquePackageNames.add(uniqueName)

                for (const e of Object.keys(binConfig.entrypoints)) {
                    if (uniqueEntrypoints[e]) {
                        throw new Error(`duplicate entrypoint: '${e}' is defined in software packages '${uniqueEntrypoints[e]}' and '${pkgID}'`)
                    }
                    uniqueEntrypoints[e] = pkgID
                }
            }

            if (pkg.environment) {
                if (uniqueEntrypoints[pkg.environment.entrypointName]) {
                    const e = pkg.environment.entrypointName
                    throw new Error(`duplicate entrypoint: '${e}' is defined in software packages '${uniqueEntrypoints[e]}' and '${pkgID}'`)
                }
            }

            // TODO: docker. Add entrypoints list verification - the entrypoints list of package must be the same for binary and docker
        }
    }

    private getName(name?: string): string {
        if (name) {
            return name
        }

        return util.trimPrefix(this.pkgJson.name, "@")
    }
}

const readPackageJson = (filePath: string) => parsePackageJson(fs.readFileSync(filePath, 'utf8'));
const parsePackageJson = (data: string) => packageJsonSchema.parse(JSON.parse(data)) as packageJson;

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
