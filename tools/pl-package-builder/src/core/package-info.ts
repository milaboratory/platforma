import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

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
    registry: z.string(),
    name: z.string().optional(),
    version: z.string().optional(),
    root: z.string().min(1),
    entrypoint: z.array(z.string()).optional(),
    cmd: z.string().optional(),
    runEnv: z.string().regex(/@/, {message: "runEnv must have <envType>@<envVersion> format, e.g. corretto@21.0.2.13.1"}).optional(),

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
    path: string
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

export class PackageInfo {
    private readonly _packageRootDir: string
    private readonly _pkgYaml: plPackageYaml
    private readonly _pkgJson: packageJson

    private _docker: DockerConfig | undefined
    private _binary: BinaryConfig | undefined

    constructor(packageRootDir: string, options?: { plPkgYamlData?: string, pkgJsonData?: string }) {
        this._packageRootDir = packageRootDir

        if (options?.plPkgYamlData) {
            this._pkgYaml = parsePlPackageYaml(options.plPkgYamlData)
        } else {
            const pkgYamlPath = path.resolve(packageRootDir, "pl.package.yaml")
            this._pkgYaml = readPlPackageYaml(pkgYamlPath)
        }

        if (options?.pkgJsonData) {
            this._pkgJson = parsePackageJson(options.pkgJsonData)
        } else {
            const pkgJsonPath = path.resolve(packageRootDir, "package.json")
            this._pkgJson = readPackageJson(pkgJsonPath)
        }
    }

    get name() : string {
        return this._pkgYaml.name ?? "main"
    }

    get packageRoot(): string {
        return this._packageRootDir
    }

    get hasDocker(): boolean {
        return this._pkgYaml.docker !== undefined
    }

    get docker(): DockerConfig {
        if (!this._docker) {
            const registry = this._pkgYaml.docker!.registry
            const name = this.getName(this._pkgYaml.docker?.name)
            const version = this.getVersion(this._pkgYaml.docker?.version)

            this._docker = {
                ...this._pkgYaml.docker,
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
        return this._pkgYaml.binary !== undefined
    }

    get binary(): BinaryConfig {
        const pkgRoot = this._packageRootDir
        if (!this._binary) {
            const registry = this._pkgYaml.binary!.registry
            const name = this.getName(this._pkgYaml.binary?.name)
            const version = this.getVersion(this._pkgYaml.binary?.version)

            this._binary = {
                ...this._pkgYaml.binary!,
                registry,
                name,
                version,

                get package(): string {
                    return `${this.name}/${this.version}.tgz`
                },

                get path(): string {
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

        if (this._pkgJson.name.startsWith("@")) {
            return this._pkgJson.name.substring(1)
        }

        return this._pkgJson.name
    }

    private getVersion(pkgVersion: string | undefined): string {
        if (pkgVersion) {
            return pkgVersion!
        }

        return this._pkgJson.version
    }
}

const readPlPackageYaml = (filePath: string) => parsePlPackageYaml(fs.readFileSync(filePath, 'utf8'))
const parsePlPackageYaml = (data: string) => plPackageYamlSchema.parse(yaml.parse(data)) as plPackageYaml;

const readPackageJson = (filePath: string) => parsePackageJson(fs.readFileSync(filePath, 'utf8'));
const parsePackageJson = (data: string) => packageJsonSchema.parse(JSON.parse(data)) as packageJson;


/*
docker:
  # The parts of final docker image tag: <registry>/<name>:<version>
  registry: "quay.io" # required
  name: "milaboratories/python-example" # defaults to the name from package.json with leading '@' dropped
  # version: 1.2.3 # defaults to the version from package.json

binary:
  registry: "milaboratories"
  name: "milaboratories/python-example" # defaults to package name with leading '@' dropped
  # version: 1.2.3 #defaults to the version in package.json

  root: "./src" # resolve relative paths starting from this directory when building and executing the package
  cmd: "./script1.py"

  runEnv: python-3.12
  requirements: "./requirements.txt"
 */
