
import path from 'path';
import fs from 'fs';
import winston from 'winston';
import { z } from 'zod';
import { BinaryPackage, PackageConfig, RunEnvironment } from './package-info';
import * as binSchema from './schemas/binary';
import * as util from './util';

const externalPackageLocationSchema = z.object({
    registry: z.string().
        describe("name of the registry to use for package download"),
    package: z.string().
        describe("full package path in registry, e.g. 'common/jdk/21.0.2.13.1-{os}-{arch}.tgz"),
})
type packageSwJson = z.infer<typeof externalPackageLocationSchema>

const runEnvironmentSchema = z.object({
    type: z.enum(binSchema.runEnvironmentTypes),
    ...externalPackageLocationSchema.shape,
    binDir: z.string(),
})
type runEnvInfo = z.infer<typeof runEnvironmentSchema>

const runDependencyJavaSchema = runEnvironmentSchema.extend({
    type: z.literal('java'),
    name: z.string().describe("name used to import this package as software dependency of tengo script"),
})
type runDependencyJava = z.infer<typeof runDependencyJavaSchema>

const runDependencyPythonSchema = runEnvironmentSchema.extend({
    type: z.literal('python'),
    name: z.string().describe("name used to import this package as software dependency of tengo script"),
})
type runDependencyPython = z.infer<typeof runDependencyPythonSchema>

const runDependencyRSchema = runEnvironmentSchema.extend({
    type: z.literal('R'),
    name: z.string().describe("name used to import this package as software dependency of tengo script"),
})
type runDependencyR = z.infer<typeof runDependencyRSchema>

const runDependencyCondaSchema = runEnvironmentSchema.extend({
    type: z.literal('conda'),
    name: z.string().describe("name used to import this package as software dependency of tengo script"),
})
type runDependencyConda = z.infer<typeof runDependencyCondaSchema>

type runDepInfo = runDependencyJava |
    runDependencyPython |
    runDependencyR |
    runDependencyConda

const anyPackageSettingsSchema = z.object({
    cmd: z.array(z.string()).min(1).
        describe("run given command, appended by args from workflow"),

    envVars: z.array(
        z.string().
            regex(/=/, "full environment variable specification is required: <var-name>=<var-value>, e.g.: IS_CI=yes")
    ).optional()
})

const binaryPackageSettingsSchema = z.object({
    type: z.literal("binary"),
    ...anyPackageSettingsSchema.shape,

    runEnv: z.undefined(),
})

const javaPackageSettingsSchema = z.object({
    type: z.literal("java"),

    ...anyPackageSettingsSchema.shape,
    runEnv: runDependencyJavaSchema,
})

const pythonPackageSettingsSchema = z.object({
    type: z.literal("python"),

    ...anyPackageSettingsSchema.shape,
    runEnv: runDependencyPythonSchema,

    requirements: z.string().
        describe("contents of requirements.txt for Python language virtual env bootstrap"),
})

const rPackageSettingsSchema = z.object({
    type: z.literal("R"),

    ...anyPackageSettingsSchema.shape,
    runEnv: runDependencyRSchema,

    renvLock: z.string().optional().
        describe("contents of renv.lock for R language virtual env bootstrap"),
})

const condaPackageSettingsSchema = z.object({
    type: z.literal("conda"),

    ...anyPackageSettingsSchema.shape,
    runEnv: runDependencyCondaSchema,

    renvLock: z.string().optional().
        describe("contents of renv.lock for R language virtual env bootstrap"),
})

const binarySchema = z.union([
    externalPackageLocationSchema.extend(binaryPackageSettingsSchema.shape),
    externalPackageLocationSchema.extend(javaPackageSettingsSchema.shape),
    externalPackageLocationSchema.extend(pythonPackageSettingsSchema.shape),
    externalPackageLocationSchema.extend(rPackageSettingsSchema.shape),
    externalPackageLocationSchema.extend(condaPackageSettingsSchema.shape),
])
type binaryInfo = z.infer<typeof binarySchema>

const localPackageLocationSchema = z.object({
    hash: z.string().
        describe("hash of software directory. Makes deduplication to work properly when you actively develop software"),
    path: z.string().
        describe("absolute path to root directory of software on local host"),
})

const localSchema = z.discriminatedUnion('type', [
    localPackageLocationSchema.extend(binaryPackageSettingsSchema.shape),
    localPackageLocationSchema.extend(javaPackageSettingsSchema.shape),
    localPackageLocationSchema.extend(pythonPackageSettingsSchema.shape),
    localPackageLocationSchema.extend(rPackageSettingsSchema.shape),
    localPackageLocationSchema.extend(condaPackageSettingsSchema.shape),
])
type localInfo = z.infer<typeof localSchema>

const entrypointSchema = z.object({
    isDev: z.boolean().optional(),

    binary: binarySchema.optional(),
    runEnv: runEnvironmentSchema.optional(),
    local: localSchema.optional(),
})
export type entrypointSwJson = z.infer<typeof entrypointSchema> & {
    artifact: util.artifactID,
}

export function readEntrypointDescriptor(npmPackageName: string, packageRoot: string, entrypointName: string): entrypointSwJson {
    const filePath = entrypointFilePath(packageRoot, entrypointName)
    if (!fs.existsSync(filePath)) {
        throw new Error(`entrypoint '${entrypointName}' not found in '${filePath}'`)
    }

    const swJsonContent = fs.readFileSync(filePath)
    const swJson = entrypointSchema.parse(JSON.parse(swJsonContent.toString()))

    return {
        artifact: {
            package: npmPackageName,
            name: entrypointName,
        },
        ...swJson,
    }
}

export function listSoftwareNames(packageRoot: string): string[] {
    const swDir = entrypointFilePath(packageRoot)
    const items = fs.readdirSync(swDir)

    return items.
        filter((fName: string) => fName.endsWith(".sw.json")).
        map((fName: string) => fName.slice(0, -".sw.json".length))
}

export class Renderer {
    constructor(
        private logger: winston.Logger,
        private npmPackageName: string,
        private npmPackageRoot: string,
    ) { }

    public renderSoftwareEntrypoints(mode: util.BuildMode, pkg: PackageConfig, options?: {
        entrypoints?: readonly string[],
        sources?: readonly util.SoftwareSource[],
        fullDirHash?: boolean
    }): Map<string, entrypointSwJson> {
        const result = new Map<string, entrypointSwJson>()

        const entrypoints = options?.entrypoints ?? this.getEntrypointNames(pkg)
        const sources = options?.sources ?? util.AllSoftwareSources
        const fullDirHash = options?.fullDirHash ?? false

        this.logger.info(`Rendering entrypoint descriptors for '${pkg.id}'...`)
        this.logger.debug("  entrypoints: " + JSON.stringify(entrypoints))
        this.logger.debug("  sources: " + JSON.stringify(sources))

        if (entrypoints.length === 0) {
            this.logger.error("list of entrypoints to be rendered is empty")
            throw new Error("nothing to render: empty list of entrypoints")
        }

        if (sources.length === 0) {
            this.logger.error("list of software sources to be put into software entrypoint is empty")
            throw new Error("nothing to render: empty list of software sources")
        }

        for (const epName of entrypoints) {
            const info: entrypointSwJson = {
                artifact: {
                    package: this.npmPackageName,
                    name: epName,
                }
            }

            if (mode !== 'release') {
                info.isDev = true
            }

            var hasDescriptors = false
            for (const source of sources) {
                switch (source) {
                    case 'binary':
                        if (!pkg.environment && !pkg.binary) {
                            this.logger.warn("  skipping 'binary' rendering (no configuration for package)")
                            continue
                        }
                        if (pkg.environment && pkg.environment.entrypointName != epName) {
                            this.logger.warn(`  skipping 'environment' rendering (no entrypoint '${epName}')`)
                            continue
                        }
                        if (pkg.environment && mode !== 'release') {
                            this.logger.warn(`  skipping 'environment' rendering (dev mode is not supported yet)`)
                            continue
                        }
                        if (pkg.binary && !pkg.binary.entrypoints[epName]) {
                            this.logger.warn(`  skipping 'binary' rendering (no entrypoint '${epName}')`)
                            continue
                        }

                        hasDescriptors = true
                        if (mode === 'dev-local') {
                            this.logger.debug("  rendering 'local' source...")
                            info.local = this.renderLocalInfo(mode, pkg, epName, fullDirHash)
                        } else {
                            this.logger.debug("  rendering 'binary' source...")
                            if (pkg.environment) {
                                info.runEnv = this.renderRunEnvInfo(mode, pkg.environment)
                            } else {
                                info.binary = this.renderBinaryInfo(mode, pkg.id, pkg.binary!, epName)
                            }
                        }
                        break

                    default:
                        util.assertNever(source)
                }
            }

            if (hasDescriptors) {
                result.set(epName, info)
            }
        }

        if (result.size === 0) {
            this.logger.error("no entrypoint descriptors were rendered")
            throw new Error("no entrypoint descriptors were rendered")
        }

        return result
    }

    public renderPackageDescriptor(mode: util.BuildMode, pkg: PackageConfig): packageSwJson {
        const desc = pkg.binary ?? pkg.environment!

        return {
            registry: desc.registry.name,
            package: desc.namePattern,
        }
    }

    public writeEntrypointDescriptor(info: entrypointSwJson, dstFile?: string) {
        const dstSwInfoPath = dstFile ?? entrypointFilePath(this.npmPackageRoot, info.artifact.name)

        this.logger.info(`Writing entrypoint descriptor to '${dstSwInfoPath}'`)

        const { artifact, ...toEncode } = info // cut 'artifact' from final .sw.json
        const encoded = JSON.stringify({
            name: util.artifactIDToString(artifact),
            ...toEncode,
        })

        util.ensureDirsExist(path.dirname(dstSwInfoPath))
        fs.writeFileSync(dstSwInfoPath, encoded + "\n")
    }

    private renderLocalInfo(mode: util.BuildMode, pkg: PackageConfig, epName: string, fullDirHash: boolean): localInfo {
        switch (mode) {
            case 'release':
                throw new Error(`'*.sw.json' generator logic error`)

            case 'dev-local':
                break

            default:
                util.assertNever(mode)
        }

        const binary = pkg.binary!
        const rootDir = binary.contentRoot
        const hash = fullDirHash ? util.hashDirSync(rootDir) : util.hashDirMetaSync(rootDir)
        const ep = binary.entrypoints[epName]
        const runEnv = this.resolveRunEnvironment(binary.environment)

        if (!ep) {
            this.logger.error(`renderer logic error: attempt to render 'local' descriptor of package '${pkg.id}' for unknown entrypoint '${epName}'`)
            throw new Error(`entrypoint '${epName}' not found in software package '${pkg.id}'`)
        }

        const pkgType = binary.type
        switch (pkgType) {
            case undefined:
            case 'binary':
                // Regular binary with no run environment dependency
                return {
                    type: "binary",
                    hash: hash.digest().toString('hex'),
                    path: rootDir,
                    cmd: ep.cmd,
                    envVars: ep.envVars
                }
            case "java":
                if (runEnv!.type !== pkgType) {
                    this.logger.error(`run environment '${binary.environment}' type '${runEnv!.type}' differs from declared package type '${binary.type}'`)
                    throw new Error(`incompatible environment: env type '${runEnv!.type}' != package type '${binary.type}'`)
                }
                return {
                    type: "java",
                    hash: hash.digest().toString('hex'),
                    path: rootDir,
                    cmd: ep.cmd,
                    envVars: ep.envVars,
                    runEnv: runEnv!,
                }
            case "python":
                if (runEnv!.type !== pkgType) {
                    this.logger.error(`run environment '${binary.environment}' type '${runEnv!.type}' differs from declared package type '${binary.type}'`)
                    throw new Error(`incompatible environment: env type '${runEnv!.type}' != package type '${binary.type}'`)
                }
                return {
                    type: "python",
                    hash: hash.digest().toString('hex'),
                    path: rootDir,
                    cmd: ep.cmd,
                    envVars: ep.envVars,
                    runEnv: runEnv!,
                    requirements: binary.requirements,
                }
            case "R":
                if (runEnv!.type !== pkgType) {
                    this.logger.error(`run environment '${binary.environment}' type '${runEnv!.type}' differs from declared package type '${binary.type}'`)
                    throw new Error(`incompatible environment: env type '${runEnv!.type}' != package type '${binary.type}'`)
                }
                return {
                    type: "R",
                    hash: hash.digest().toString('hex'),
                    path: rootDir,
                    cmd: ep.cmd,
                    envVars: ep.envVars,
                    runEnv: runEnv!,
                    renvLock: binary.renvLock,
                }
            case "conda":
                if (runEnv!.type !== pkgType) {
                    this.logger.error(`run environment '${binary.environment}' type '${runEnv!.type}' differs from declared package type '${binary.type}'`)
                    throw new Error(`incompatible environment: env type '${runEnv!.type}' != package type '${binary.type}'`)
                }
                return {
                    type: "conda",
                    hash: hash.digest().toString('hex'),
                    path: rootDir,
                    cmd: ep.cmd,
                    envVars: ep.envVars,
                    runEnv: runEnv!,
                }
            default:
                util.assertNever(pkgType)
                throw new Error("renderer logic error: renderLocalInfo does not cover all package types")
        }
    }

    private renderBinaryInfo(mode: util.BuildMode, pkgID: string, binary: BinaryPackage, epName: string): binaryInfo {
        switch (mode) {
            case 'release':
                break

            case 'dev-local':
                throw new Error(`'*.sw.json' generator logic error`)
                break

            default:
                util.assertNever(mode)
        }

        const ep = binary.entrypoints[epName]
        if (!ep) {
            this.logger.error(`renderer logic error: attempt to render 'binary' descriptor of package '${pkgID}' for unknown entrypoint '${epName}'`)
            throw new Error(`entrypoint '${epName}' not found in software package '${pkgID}'`)
        }
        const runEnv = this.resolveRunEnvironment(binary.environment)

        const pkgType = binary.type
        switch (pkgType) {
            case undefined:
            case 'binary':
                // Regular binary with no run environment dependency
                return {
                    type: "binary",
                    registry: binary.registry.name!,
                    package: binary.namePattern,

                    cmd: ep.cmd,
                    envVars: ep.envVars
                }
            case "java":
                if (runEnv!.type !== pkgType) {
                    this.logger.error(`run environment '${binary.environment}' type '${runEnv!.type}' differs from declared package type '${binary.type}'`)
                    throw new Error(`incompatible environment: env type '${runEnv!.type}' != package type '${binary.type}'`)
                }
                return {
                    type: "java",
                    registry: binary.registry.name!,
                    package: binary.namePattern,

                    cmd: ep.cmd,
                    envVars: ep.envVars,
                    runEnv: runEnv!,
                }
            case "python":
                if (runEnv!.type !== pkgType) {
                    this.logger.error(`run environment '${binary.environment}' type '${runEnv!.type}' differs from declared package type '${binary.type}'`)
                    throw new Error(`incompatible environment: env type '${runEnv!.type}' != package type '${binary.type}'`)
                }
                return {
                    type: "python",
                    registry: binary.registry.name!,
                    package: binary.namePattern,

                    cmd: ep.cmd,
                    envVars: ep.envVars,
                    runEnv: runEnv!,
                    requirements: binary.requirements,
                }
            case "R":
                if (runEnv!.type !== pkgType) {
                    this.logger.error(`run environment '${binary.environment}' type '${runEnv!.type}' differs from declared package type '${binary.type}'`)
                    throw new Error(`incompatible environment: env type '${runEnv!.type}' != package type '${binary.type}'`)
                }
                return {
                    type: "R",
                    registry: binary.registry.name!,
                    package: binary.namePattern,

                    cmd: ep.cmd,
                    envVars: ep.envVars,
                    runEnv: runEnv!,
                    renvLock: binary.renvLock,
                }
            case "conda":
                if (runEnv!.type !== pkgType) {
                    this.logger.error(`run environment '${binary.environment}' type '${runEnv!.type}' differs from declared package type '${binary.type}'`)
                    throw new Error(`incompatible environment: env type '${runEnv!.type}' != package type '${binary.type}'`)
                }
                return {
                    type: "conda",
                    registry: binary.registry.name!,
                    package: binary.namePattern,

                    cmd: ep.cmd,
                    envVars: ep.envVars,
                    runEnv: runEnv!,
                }
            default:
                util.assertNever(pkgType)
                throw new Error("renderer logic error: renderBinaryInfo does not cover all package types")
        }
    }

    private renderRunEnvInfo(mode: util.BuildMode, env: RunEnvironment): runEnvInfo {
        switch (mode) {
            case 'release':
                break

            case 'dev-local':
                throw new Error(`run environments do not support 'local' dev build mode yet`)

            default:
                util.assertNever(mode)
        }

        return {
            type: env.type,
            registry: env.registry.name!,
            package: env.namePattern,
            binDir: env.binDir,
        }
    }

    private resolveDependency(npmPackageName: string, entrypointName: string): entrypointSwJson {
        const modulePath = util.findInstalledModule(this.logger, npmPackageName, this.npmPackageRoot)
        return readEntrypointDescriptor(npmPackageName, modulePath, entrypointName)
    }

    private resolveRunEnvironment(envName: string | undefined): runDepInfo | undefined {
        if (!envName) {
            return undefined
        }

        const [pkgName, id] = util.rSplit(envName, ':', 2)
        const swDescriptor = (pkgName === "") ? readEntrypointDescriptor(this.npmPackageName, this.npmPackageRoot, id) : this.resolveDependency(pkgName, id)

        if (!swDescriptor.runEnv) {
            throw new Error(`software '${envName}' cannot be used as run environment (no 'runEnv' section in entrypoint descriptor)`)
        }

        return {
            name: envName,

            type: swDescriptor.runEnv.type,
            registry: swDescriptor.runEnv.registry,
            package: swDescriptor.runEnv.package,
            binDir: swDescriptor.runEnv.binDir,
        }
    }

    private getEntrypointNames(pkg: PackageConfig): string[] {
        const names: string[] = []
        if (pkg.environment) {
            names.push(pkg.environment.entrypointName)
        }

        if (pkg.binary) {
            for (const epName of Object.keys(pkg.binary.entrypoints)) {
                names.push(epName)
            }
        }

        return names
    }
}

export function entrypointFilePath(packageRoot: string, entrypointName?: string): string {
    if (!entrypointName) {
        return path.resolve(packageRoot, "dist", "tengo", "software")
    }

    return path.resolve(packageRoot, "dist", "tengo", "software", `${entrypointName}.sw.json`)
}
