import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import winston from 'winston';

import { z } from 'zod';

const dockerConfigSchema = z.object({
    registry: z.string(), // name of the registry (e.g. quay.io)
    name: z.string().optional(), // name of docker image inside the registry without version
    version: z.string().optional(), // version of docker image

    entrypoint: z.array(z.string()).optional(), // entrypoint override
    cmd: z.array(z.string()).optional(), // use custom default command
});

type dockerConfig = z.infer<typeof dockerConfigSchema>;
interface DockerConfig extends dockerConfig {
    name: string
    version: string
    tag: string
}

const binaryConfigSchema = z.object({
    registry: z.object({
        name: z.string().min(1),
    }),
    name: z.string().optional(),
    version: z.string().optional(),
    crossplatform: z.boolean().default(false),
    root: z.string().min(1),
    entrypoint: z.array(z.string()).optional(),
    cmd: z.string().optional(),
    runEnv: z.string().
        regex(/@/, { message: "runEnv must have <envType>@<envVersion> format, e.g. corretto@21.0.2.13.1" }).
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
    package: string
    contentRoot: string // absolute path to package's content root
}

const plPackageYamlSchema = z.object({
    name: z.string().optional().
        describe("name of software descriptor for imports (ll.importSoftware('<package>:<NAME>')"),
    docker: dockerConfigSchema.optional(),
    binary: binaryConfigSchema.optional()
})
type plPackageYaml = z.infer<typeof plPackageYamlSchema>

const packageJsonSchema = z.object({
    name: z.string(),
    version: z.string()
})
type packageJson = z.infer<typeof packageJsonSchema>

const plPackageYamlName = "pl.package.yaml"
const packageJsonName = "package.json"

/*
 * pl.package.yaml content structure example:
 *
 * docker:
 *   registry: "quay.io"
 *   name: "milaboratories/python-example-docker"
 *   version: "1.2.3-awe"
 *
 * binary:
 *   registry: "milaboratories"
 *   name: "milaboratories/python-example-binary"
 *   version: "1.2.3"
 *
 *   root: "./src"
 *   cmd: "./script1.py"
 *
 *   runEnv: "python@3.12"
 *   requirements: "./requirements.txt"
 */
export class PackageInfo {
    private readonly pkgYaml: plPackageYaml
    private readonly pkgJson: packageJson

    private _docker: DockerConfig | undefined
    private _binary: BinaryConfig | undefined

    constructor(
        private logger: winston.Logger,
        private packageRootDir: string,
        options?: { plPkgYamlData?: string, pkgJsonData?: string }
    ) {
        this.logger.info("Reading package information...")

        if (options?.plPkgYamlData) {
            this.pkgYaml = parsePlPackageYaml(options.plPkgYamlData)
        } else {
            const pkgYamlPath = path.resolve(packageRootDir, plPackageYamlName)
            this.logger.debug(`  - loading '${pkgYamlPath}'`)
            this.pkgYaml = readPlPackageYaml(pkgYamlPath)
            this.logger.debug("    " + JSON.stringify(this.pkgYaml))
        }

        if (options?.pkgJsonData) {
            this.pkgJson = parsePackageJson(options.pkgJsonData)
        } else {
            const pkgJsonPath = path.resolve(packageRootDir, packageJsonName)
            this.logger.debug(`  - loading '${pkgJsonPath}'`)
            this.pkgJson = readPackageJson(pkgJsonPath)
            this.logger.debug("    " + JSON.stringify(this.pkgJson))
        }

        logger.debug('  package information loaded successfully.')
    }

    get name(): string {
        return this.pkgYaml.name ?? "main"
    }

    get packageRoot(): string {
        return this.packageRootDir
    }

    get hasDocker(): boolean {
        return this.pkgYaml.docker !== undefined
    }

    get docker(): DockerConfig {
        if (!this.hasDocker) {
            this.logger.error(`No 'docker' configuration in ${plPackageYamlName} file`)
            throw new Error("no 'docker' configuration")
        }

        if (!this._docker) {
            this.logger.debug("  generating docker config from package info")

            const registry = this.pkgYaml.docker!.registry
            const name = this.getName(this.pkgYaml.docker?.name)
            const version = this.getVersion(this.pkgYaml.docker?.version)

            this._docker = {
                ...this.pkgYaml.docker,
                registry,
                name,
                version,

                get tag(): string {
                    return `${this.registry}/${this.name}:${this.version}`
                }
            }
        }

        return this._docker!
    }

    get hasBinary(): boolean {
        return this.pkgYaml.binary !== undefined
    }

    get binary(): BinaryConfig {
        if (!this.hasBinary) {
            this.logger.error(`No 'binary' configuration in ${plPackageYamlName} file`)
            throw new Error("no 'binary' configuration")
        }

        if (!this._binary) {
            this.logger.debug("  generating binary config from package info")

            const pkgRoot = this.packageRootDir
            const crossplatform = this.pkgYaml.binary!.crossplatform

            const registry = this.pkgYaml.binary!.registry
            const name = this.getName(this.pkgYaml.binary?.name)
            const version = this.getVersion(this.pkgYaml.binary?.version)

            this._binary = {
                ...this.pkgYaml.binary!,
                registry,
                name,
                version,

                get package(): string {
                    if (crossplatform) {
                        return `${this.name}/${this.version}.tgz`
                    }
                    return `${this.name}/${this.version}-{os}-{arch}.tgz`
                },

                get contentRoot(): string {
                    return path.resolve(pkgRoot, this.root)
                }
            }
        }

        return this._binary
    }

    private getName(pkgName: string | undefined): string {
        if (pkgName) {
            return pkgName!
        }

        if (this.pkgJson.name.startsWith("@")) {
            return this.pkgJson.name.substring(1)
        }

        return this.pkgJson.name
    }

    private getVersion(pkgVersion: string | undefined): string {
        if (pkgVersion) {
            return pkgVersion!
        }

        return this.pkgJson.version
    }
}

const readPlPackageYaml = (filePath: string) => parsePlPackageYaml(fs.readFileSync(filePath, 'utf8'))
const parsePlPackageYaml = (data: string) => plPackageYamlSchema.parse(yaml.parse(data)) as plPackageYaml;

const readPackageJson = (filePath: string) => parsePackageJson(fs.readFileSync(filePath, 'utf8'));
const parsePackageJson = (data: string) => packageJsonSchema.parse(JSON.parse(data)) as packageJson;
