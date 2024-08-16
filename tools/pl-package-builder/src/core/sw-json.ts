
import path from 'path';
import fs from 'fs';
import winston from 'winston';
import { z } from 'zod';
import { PackageInfo, runEnvironmentTypes } from './package-info';
import * as util from './util';

const dockerSchema = z.object({
    image: z.string().
        describe("full tag name for 'docker pull'"),
    entrypoint: z.array(z.string()).optional().
        describe("use custom entrypoint for docker container"),
    cmd: z.array(z.string()).optional().
        describe("prepend custom default command before args (can be overriden in particular workflow)"),
    // the final command to be executed is: <entrypoint> <cmd> <args>
});
type dockerInfo = z.infer<typeof dockerSchema>;

const binaryLocationSchema = z.object({
    registry: z.string().
        describe("name of the registry to use for package download"),
    package: z.string().
        describe("full package path in registry, e.g. 'common/jdk/21.0.2.13.1-{os}-{arch}.tgz"),
})

const runEnvironmentSchema = z.object({
    type: z.enum(runEnvironmentTypes),
    ...binaryLocationSchema.shape,
    entrypoint: z.array(z.string()),
})
type runEnvInfo = z.infer<typeof runEnvironmentSchema>

const binarySettingsSchema = z.object({
    entrypoint: z.array(z.string()).optional().
        describe("the same as in 'docker': thing to be prepended to the final command before runnning it"),
    cmd: z.string().optional().
        describe("prepend custom default command before args (can be overriden in particular workflow)"),
    // the final command to be executed is: <entrypoint> <cmd> <args>

    runEnv: runEnvironmentSchema.optional().
        describe("run environment requirement to be provided for software when executed in binary mode (locally on server)"),

    // python-specific options
    requirements: z.string().optional().
        describe("contents of requirements.txt for Python language virtual env bootstrap"),

    // R-specific options
    renvLock: z.string().optional().
        describe("contents of renv.lock for R language virtual env bootstrap"),
})

const binarySchema = z.object({
    ...binaryLocationSchema.shape,
    ...binarySettingsSchema.shape,
})
type binaryInfo = z.infer<typeof binarySchema>

const localSchema = z.object({
    hash: z.string().
        describe("hash of software directory. Makes deduplication to work properly when you actively develop software"),
    path: z.string().
        describe("absolute path to root directory of software on local host"),

    ...binarySettingsSchema.shape,
})
type localInfo = z.infer<typeof localSchema>

const swJsonSchema = z.object({
    docker: dockerSchema.optional(),
    binary: binarySchema.optional(),
    runEnv: runEnvironmentSchema.optional(),
    local: localSchema.optional(),
    isDev: z.boolean().optional(),
})
export type SoftwareInfo = z.infer<typeof swJsonSchema>

export function readSoftwareInfo(packageRoot: string, swName: string): SoftwareInfo {
    const filePath = swJsonPath(packageRoot, swName)
    const swJsonContent = fs.readFileSync(filePath)

    return swJsonSchema.parse(JSON.parse(swJsonContent.toString()))
}

export function listSoftwareIDs(packageRoot: string): string[] {
    const swDir = swJsonPath(packageRoot)
    const items = fs.readdirSync(swDir)

    return items.
        filter((fName: string) => fName.endsWith(".sw.json")).
        map((fName: string) => fName.slice(0, -".sw.json".length))
}

export class SoftwareDescriptor {
    constructor(
        private logger: winston.Logger,
        private packageInfo: PackageInfo,
    ) { }

    public render(mode: util.BuildMode, sources: readonly util.SoftwareSource[]): SoftwareInfo {
        this.logger.info("Rendering software descriptor...")
        this.logger.debug("  sources: " + JSON.stringify(sources))

        if (sources.length === 0) {
            this.logger.error("list of software sources to be put into software descriptor is empty")
            throw new Error("empty list of software sources")
        }

        const info: SoftwareInfo = {}

        if (mode !== 'release') {
            info.isDev = true
        }

        for (const source of sources) {
            switch (source) {
                // case 'docker':
                //     this.logger.debug("  rendering 'docker' source...")
                //     info.docker = this.renderDockerInfo()
                //     break

                case 'binary':
                    if (mode === 'dev-local') {
                        this.logger.debug("  rendering 'local' source...")
                        info.local = this.renderLocalInfo(mode)
                    } else {
                        this.logger.debug("  rendering 'binary' source...")
                        if (this.packageInfo.hasEnvironment) {
                            info.runEnv = this.renderRunEnvInfo(mode)
                        } else {
                            info.binary = this.renderBinaryInfo(mode)
                        }
                    }
                    break

                default:
                    util.assertNever(source)
            }
        }

        if (Object.values(info).length === 0) {
            this.logger.error("software descriptor is empty after rendering")
            throw new Error("software descriptor is empty after rendering")
        }

        this.logger.debug("    " + JSON.stringify(info))

        return info
    }

    public write(info: SoftwareInfo) {
        const dstSwInfoPath = swJsonPath(this.packageInfo.packageRoot, this.packageInfo.descriptorName)

        this.logger.info(`Writing software descriptor to '${dstSwInfoPath}'`)

        const encoded = JSON.stringify(info)

        util.ensureDirsExist(path.dirname(dstSwInfoPath))
        fs.writeFileSync(dstSwInfoPath, encoded+"\n")
    }

    private renderLocalInfo(mode: util.BuildMode): localInfo {
        if (!this.packageInfo.hasBinary) {
            throw new Error(`pl.package.yaml file does not contain definition for binary package`)
        }

        switch (mode) {
            case 'release':
                throw new Error(`'*.sw.json' generator logic error`)
                break

            case 'dev-local':
                break

            default:
                util.assertNever(mode)
        }

        const binary = this.packageInfo.binary
        const env = this.renderRunEnvDep(binary.runEnv)
        const rootDir = binary.contentRoot
        const hash = util.hashDirMetaSync(rootDir)

        return {
            hash: hash.toString('hex'),
            path: rootDir,

            entrypoint: binary.entrypoint,
            cmd: binary.cmd,
            runEnv: env,
            requirements: binary.requirements,
            renvLock: binary.renvLock,
        }
    }

    private renderBinaryInfo(mode: util.BuildMode): binaryInfo {
        if (!this.packageInfo.hasBinary) {
            throw new Error(`pl.package.yaml file does not contain definition for binary package`)
        }

        switch (mode) {
            case 'release':
                break

            case 'dev-local':
                throw new Error(`'*.sw.json' generator logic error`)
                break

            default:
                util.assertNever(mode)
        }

        const binary = this.packageInfo.binary
        const env = this.renderRunEnvDep(binary.runEnv)

        return {
            registry: binary.registry.name!,
            package: binary.addressPattern,
            entrypoint: binary.entrypoint,
            cmd: binary.cmd,
            runEnv: env,
            requirements: binary.requirements,
            renvLock: binary.renvLock,
        }
    }

    private renderRunEnvInfo(mode: util.BuildMode): runEnvInfo {
        if (!this.packageInfo.hasEnvironment) {
            throw new Error(`pl.package.yaml file does not contain definition for execution environment`)
        }

        switch (mode) {
            case 'release':
                break

            case 'dev-local':
                throw new Error(`run environments do not support 'local' dev build mode yet`)

            default:
                util.assertNever(mode)
        }

        const env = this.packageInfo.environment

        return {
            type: env.type,
            registry: env.registry.name!,
            package: env.addressPattern,
            entrypoint: env.entrypoint,
        }
    }

    private renderDockerInfo(mode: util.BuildMode): dockerInfo {
        if (!this.packageInfo.hasDocker) {
            throw new Error(`pl.package.yaml file does not contain definition for docker image`)
        }

        const docker = this.packageInfo.docker

        switch (mode) {
            case 'release':
                break

            case 'dev-local':
                docker.registry = 'local'
                break

            default:
                util.assertNever(mode)
        }

        return {
            image: docker.tag,
            entrypoint: docker.entrypoint,
            cmd: docker.cmd,
        }
    }

    private resolveDependency(name: string, softwareID: string): SoftwareInfo {
        const modulePath = util.findInstalledModule(this.logger, name, this.packageInfo.packageRoot)
        return readSoftwareInfo(modulePath, softwareID)
    }

    private renderRunEnvDep(envName?: string): runEnvInfo | undefined {
        if (!envName) {
            return undefined
        }

        const [pkgName, id] = util.rSplit(envName, ':', 2)
        const swDescriptor = this.resolveDependency(pkgName, id)

        if (!swDescriptor.runEnv) {
            throw new Error(`software '${envName}' cannot be used as run environment (no 'runEnv' section in descriptor)`)
        }

        return {
            type: swDescriptor.runEnv.type,
            registry: swDescriptor.runEnv.registry,
            package: swDescriptor.runEnv.package,
            entrypoint: swDescriptor.runEnv.entrypoint,
        }
    }
}

export function swJsonPath(packageRoot: string, swName?: string): string {
    if (!swName) {
        return path.resolve(packageRoot, "dist", "tengo", "software")
    }

    return path.resolve(packageRoot, "dist", "tengo", "software", `${swName}.sw.json`)
}
