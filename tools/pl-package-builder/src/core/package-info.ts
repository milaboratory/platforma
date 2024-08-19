import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import winston from 'winston';

import { z } from 'zod';
import * as util from './util';
import * as envs from './envs';

const dockerConfigSchema = z.object({
    registry: z.string().describe("name of the registry, i.e. 'quay.io'"),
    imageName: z.string().optional().describe("name of docker image inside the registry: <registry>/<imageName>:<version>"),
    version: z.string().optional().describe("version part of docker image tag: <registry>/<imageName>:<version>"),

    entrypoint: z.array(z.string()).optional(), // entrypoint override
    cmd: z.array(z.string()).optional(), // use custom default command
});

type dockerConfig = z.infer<typeof dockerConfigSchema>;
interface DockerConfig extends dockerConfig {
    imageName: string
    version: string
    tag: string
}

const registrySchema = z.object({
    name: z.string().optional(),
    storageURL: z.string().optional(),
})
type registry = z.infer<typeof registrySchema>

// common fields both for 'environment' and 'binary'
const commonBinaryConfigSchema = z.object({
    registry: registrySchema,
    name: z.string().optional(),
    version: z.string().optional(),
    crossplatform: z.boolean().default(false),
    root: z.string().min(1),
})

type commonBinaryConfig = z.infer<typeof commonBinaryConfigSchema>
export interface CommonBinaryConfig extends commonBinaryConfig {
    name: string
    version: string
    fullName: (os: util.OSType, arch: util.ArchType) => string // full package name inside registry (common/corretto/21.2.0.4.1-linux-x64.tgz)
    addressPattern: string // address to put into sw.json (common/corretto/21.2.0.4.1-{os}-{arch}.tgz)
    contentRoot: string // absolute path to package's content root
}

const binaryConfigSchema = z.object({
    ...commonBinaryConfigSchema.shape,

    entrypoint: z.array(z.string()).optional().
        describe("the same as in 'docker': thing to be prepended to the final command before runnning it"),
    cmd: z.string().optional().
        describe("prepend custom default command before args (can be overriden for particular exec)"),

    runEnv: z.string().
        regex(/:/, { message: "runEnv must have <envPackage>:<ID> format, e.g milaboratory/runenv-java-corretto:main" }).
        optional(),

    // python-specific options
    requirements: z.string().optional(), // path to requirements.txt

    // R-specific options
    renvLock: z.string().optional(), // path to renv.lock
});

type binaryConfig = z.infer<typeof binaryConfigSchema>
export interface BinaryConfig extends binaryConfig {
    name: string
    version: string
    fullName: (os: util.OSType, arch: util.ArchType) => string // full package name inside registry (common/corretto/21.2.0.4.1-linux-x64.tgz)
    addressPattern: string // address to put into sw.json (common/corretto/21.2.0.4.1-{os}-{arch}.tgz)
    contentRoot: string // absolute path to package's content root
    entrypoint: string[]
}

export const runEnvironmentTypes = ['java', 'python', 'R', 'conda'] as const;
export type runEnvironmentType = (typeof runEnvironmentTypes)[number];

const runEnvironmentConfigSchema = z.object({
    type: z.enum(runEnvironmentTypes).
        describe("run environment type"),

    ...commonBinaryConfigSchema.shape,

    binDir: z.string().
        describe("path to 'bin' directory to be added to PATH when software uses this run environment"),
});

type runEnvironmentConfig = z.infer<typeof runEnvironmentConfigSchema>
export interface RunEnvironmentConfig extends runEnvironmentConfig {
    type: runEnvironmentType
    name: string
    version: string
    fullName: (os: util.OSType, arch: util.ArchType) => string // full package name inside registry (common/corretto/21.2.0.4.1-linux-x64.tgz)
    addressPattern: string // address to put into sw.json (common/corretto/21.2.0.4.1-{os}-{arch}.tgz)
    contentRoot: string // absolute path to package's content root
}

const plPackageYamlSchema = z.object({
    name: z.string().optional().
        describe("name of software descriptor for imports (ll.importSoftware('<package>:<NAME>')"),

    docker: dockerConfigSchema.optional(),
    binary: binaryConfigSchema.optional(),
    environment: runEnvironmentConfigSchema.optional(),
}).refine(
    data => (!(data.binary && data.environment) && (data.binary || data.environment)),
    {
        message: "software package can provide either binary for execution, either execution environment. Never both",
        path: ['binary', 'environment']
    }
)
type plPackageYaml = z.infer<typeof plPackageYamlSchema>

const packageJsonSchema = z.object({
    name: z.string(),
    version: z.string()
})
type packageJson = z.infer<typeof packageJsonSchema>

/*
 * pl.package.yaml content structure example:
 *
 * docker:
 *   registry: "quay.io"          # required
 *   name: "my-org/example-image" # defaults to full npm package name without leading '@'
 *   version: "1.2.3-awe"         # defaults to npm package version
 *
 * binary:
 *   registry:
 *      storageURL: s3://<bucket>/<some-prefix>?region=<region-name>
 *      name: "my-org"      # defaults to 'scope' of npm package without leading '@'
 *   name: "example-binary" # defaults to name of npm package (without scope, if any)
 *   version: "1.2.3"       # defaults to npm package version
 *
 *   root: "./src" # required. Path to package's content root
 *   cmd: ["./script1.jar"]
 *
 *   runEnv: "runenv-java-corretto:21.0.2.13.1"
 */
export class PackageInfo {
    private readonly pkgYaml: plPackageYaml
    private readonly pkgJson: packageJson
    public readonly packageRoot: string

    private _versionOverride: string | undefined
    private _descriptorNameOverride: string | undefined

    private _docker: DockerConfig | undefined
    private _binary: BinaryConfig | undefined
    private _environment: RunEnvironmentConfig | undefined

    constructor(
        private logger: winston.Logger,
        options?: {
            packageRoot?: string,
            plPkgYamlData?: string,
            pkgJsonData?: string,
        }
    ) {
        this.logger.info("Reading package information...")

        this.packageRoot = options?.packageRoot ?? util.findPackageRoot(logger)

        if (options?.plPkgYamlData) {
            this.pkgYaml = parsePlPackageYaml(options.plPkgYamlData)
        } else {
            const pkgYamlPath = path.resolve(this.packageRoot, util.plPackageYamlName)
            this.logger.debug(`  - loading '${pkgYamlPath}'`)
            if (!fs.existsSync(pkgYamlPath)) {
                this.logger.error(`no '${util.plPackageYamlName}' file found at '${this.packageRoot}'`)
                throw new Error("not a platform software package directory")
            }

            this.pkgYaml = readPlPackageYaml(pkgYamlPath)
            this.logger.debug("    " + JSON.stringify(this.pkgYaml))
        }

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

        logger.debug('  package information loaded successfully.')
    }

    set descriptorName(n: string | undefined) {
        this._descriptorNameOverride = n
    }

    get descriptorName(): string {
        if (this._descriptorNameOverride) {
            return this._descriptorNameOverride
        }

        return this.pkgYaml.name ?? "main"
    }

    // Name to be used when importing this package as a software dependency of tengo script
    get dependencyName(): string {
        return `${this.pkgJson.name}:${this.descriptorName}`
    }

    get hasDocker(): boolean {
        return this.pkgYaml.docker !== undefined
    }

    get docker(): DockerConfig {
        if (!this.hasDocker) {
            this.logger.error(`No 'docker' configuration in ${util.plPackageYamlName} file`)
            throw new Error("no 'docker' configuration")
        }

        if (!this._docker) {
            this.logger.debug("  generating docker config from package info")

            const registry = this.pkgYaml.docker!.registry
            const imageName = this.getName(this.pkgYaml.docker?.imageName)
            const version = this.getVersion(this.pkgYaml.docker?.version)

            this._docker = {
                ...this.pkgYaml.docker,
                registry,
                imageName,
                version,

                get tag(): string {
                    return `${this.registry}/${this.imageName}:${this.version}`
                }
            }
        }

        return this._docker!
    }

    get hasBinary(): boolean {
        return this.pkgYaml.binary !== undefined
    }

    get hasEnvironment(): boolean {
        return this.pkgYaml.environment !== undefined
    }

    get binary(): BinaryConfig {
        if (!this.hasBinary) {
            this.logger.error(`no 'binary' configuration in ${util.plPackageYamlName} file`)
            throw new Error("no 'binary' configuration")
        }

        if (!this._binary) {
            this.logger.debug("  generating binary config from package info")

            const pkgRoot = this.packageRoot
            const crossplatform = this.pkgYaml.binary!.crossplatform

            const registry = this.pkgYaml.binary!.registry
            var name: string
            [name, registry.name] = this.binaryNameAndRegistry(this.pkgYaml.binary!)
            const version = this.getVersion(this.pkgYaml.binary?.version)

            this._binary = {
                ...this.pkgYaml.binary!,
                registry,
                name,
                version,
                entrypoint: this.pkgYaml.binary!.entrypoint ?? [],

                fullName(os: util.OSType, arch: util.ArchType): string {
                    return binaryPackageFullName(crossplatform, this.name, this.version, os, arch)
                },

                get addressPattern(): string {
                    return binaryPackageAddressPattern(crossplatform, this.name, this.version)
                },

                get contentRoot(): string {
                    return path.resolve(pkgRoot, this.root)
                }
            }
        }

        return this._binary
    }

    get environment(): RunEnvironmentConfig {
        if (!this.hasEnvironment) {
            this.logger.error(`No 'environment' configuration in ${util.plPackageYamlName} file`)
            throw new Error("no 'environment' configuration")
        }

        if (!this._environment) {
            this.logger.debug("  generating environment config from package info")

            const pkgRoot = this.packageRoot
            const crossplatform = this.pkgYaml.environment!.crossplatform

            const registry = this.pkgYaml.environment!.registry
            var name: string
            [name, registry.name] = this.binaryNameAndRegistry(this.pkgYaml.environment!)
            const version = this.getVersion(this.pkgYaml.environment?.version)

            this._environment = {
                ...this.pkgYaml.environment!,
                registry,
                name,
                version,

                fullName(os: util.OSType, arch: util.ArchType): string {
                    return binaryPackageFullName(crossplatform, this.name, this.version, os, arch)
                },

                get addressPattern(): string {
                    return binaryPackageAddressPattern(crossplatform, this.name, this.version)
                },

                get contentRoot(): string {
                    return path.resolve(pkgRoot, this.root)
                }
            }
        }

        return this._environment
    }

    private getName(pkgName: string | undefined): string {
        if (process.env[envs.PL_PKG_NAME]) {
            return process.env[envs.PL_PKG_NAME]
        }

        if (pkgName) {
            return pkgName!
        }

        return util.trimPrefix(this.pkgJson.name, "@")
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
            return pkgVersion!
        }

        return this.pkgJson.version
    }

    /*
     * When binary.registry.name is empty - use scope from npm package name (without @ prefix)
     * When binary.name is also empty - use name part from npm package name (cut scope prefix)
     */
    private binaryNameAndRegistry(desc: { name?: string, registry: registry }): [string, string] {
        const name = desc.name
        const registry = desc.registry
        if (name && registry.name) {
            return [name, registry.name]
        }

        const npmNameParts = this.pkgJson.name.split("/")
        const npmScope = (npmNameParts.length === 2) ? npmNameParts[0] : ""
        const npmName = (npmNameParts.length === 2) ? npmNameParts[1] : this.pkgJson.name

        if (!registry.name) {
            if (npmScope === "") {
                // Require scope in npm package name only when we do not have registry name in binary settings
                throw new Error(`Can't get software registry name for descriptor: no 'binary.registry.name' is set in '${util.plPackageYamlName}' and 'name' in '${util.packageJsonName}' has no scope`)
            }
            registry.name = util.trimPrefix(npmScope, '@')
        }

        return [name ?? npmName, registry.name]
    }
}

const readPlPackageYaml = (filePath: string) => parsePlPackageYaml(fs.readFileSync(filePath, 'utf8'))
const parsePlPackageYaml = (data: string) => plPackageYamlSchema.parse(yaml.parse(data)) as plPackageYaml;

const readPackageJson = (filePath: string) => parsePackageJson(fs.readFileSync(filePath, 'utf8'));
const parsePackageJson = (data: string) => packageJsonSchema.parse(JSON.parse(data)) as packageJson;

function binaryPackageFullName(crossplatform: boolean, name: string, version: string, os: util.OSType, arch: util.ArchType): string {
    if (crossplatform) {
        return `${name}/${version}.tgz`
    }

    return `${name}/${version}-${os}-${arch}.tgz`
}

function binaryPackageAddressPattern(crossplatform: boolean, name: string, version: string): string {
    if (crossplatform) {
        return `${name}/${version}.tgz`
    }

    return `${name}/${version}-{os}-{arch}.tgz`
}
