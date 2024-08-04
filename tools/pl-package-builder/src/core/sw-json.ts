
import { z } from 'zod';
import { PackageInfo } from './package-info';
import { assertNever, ensureDirsExist, hashDirMetaSync } from './util';
import { writeFileSync } from 'fs';
import path from 'path';
import { BuildMode } from './flags';
import winston from 'winston';

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

const binarySettingsSchema = z.object({
    entrypoint: z.array(z.string()).optional().
        describe("the same as in 'docker': thing to be prepended to the final command before runnning it"),
    cmd: z.string().optional().
        describe("prepend custom default command before args (can be overriden in particular workflow)"),
    // the final command to be executed is: <entrypoint> <cmd> <args>

    runEnv: z.string().optional().
        describe("name of run env requirement in format <envType>@<version> (e.g. corretto@21.0.2.13.1)"),

    // python-specific options
    requirements: z.string().optional().
        describe("contents of requirements.txt for Python language virtual env bootstrap"),

    // R-specific options
    renvLock: z.string().optional().
        describe("contents of renv.lock for R language virtual env bootstrap"),
})

const binarySchema = z.object({
    registry: z.string().
        describe("name of the registry to use for package download"),
    package: z.string().
        describe("full package path in registry, e.g. 'common/jdk/21.0.2.13.1-{os}-{arch}.tgz"),

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
    local: localSchema.optional()
})
export type SoftwareInfo = z.infer<typeof swJsonSchema>

export const allSoftwareSources = ['docker', 'binary'] as const;
export type softwareSource = (typeof allSoftwareSources)[number];

export class SoftwareDescriptor {
    constructor(
        private logger: winston.Logger,
        private packageInfo: PackageInfo,
        private mode: BuildMode,
    ) { }

    public render(sources: readonly softwareSource[]): SoftwareInfo {
        this.logger.info("Rendering software descriptor...")

        if (sources.length === 0) {
            this.logger.error("list of software sources to be put into software descriptor is empty")
            throw new Error("empty list of software sources")
        }

        const info: SoftwareInfo = {}

        for (const source of sources) {
            switch (source) {
                case 'docker':
                    this.logger.debug("  rendering 'docker' source...")
                    info.docker = this.renderDockerInfo()
                    break

                case 'binary':
                    if (this.mode === 'dev-local') {
                        this.logger.debug("  rendering 'local' source...")
                        info.local = this.renderLocalInfo()
                    } else {
                        this.logger.debug("  rendering 'binary' source...")
                        info.binary = this.renderBinaryInfo()
                    }
                    break

                default:
                    assertNever(source)
            }
        }

        if (Object.values(info).length === 0)  {
            this.logger.error("software descriptor is empty after rendering")
            throw new Error("software descriptor is empty after rendering")
        }

        this.logger.debug("    " + JSON.stringify(info))

        return info
    }

    public write(info: SoftwareInfo) {
        const dstSwInfoPath = path.resolve(
            this.packageInfo.packageRoot,
            "dist", "tengo", "software", `${this.packageInfo.name}.sw.json`,
        )

        this.logger.info(`Writing software descriptor to '${dstSwInfoPath}'`)

        const encoded = JSON.stringify(info)

        ensureDirsExist(path.dirname(dstSwInfoPath))
        writeFileSync(dstSwInfoPath, encoded)
    }

    private renderLocalInfo(): localInfo {
        if (!this.packageInfo.hasBinary) {
            throw new Error(`pl.package.yaml file does not contain definition for binary package`)
        }

        switch (this.mode) {
            case 'release':
                throw new Error(`'*.sw.json' generator logic error`)
                break

            case 'dev-local':
                break

            default:
                assertNever(this.mode)
        }

        const binary = this.packageInfo.binary
        const rootDir = binary.contentRoot
        const hash = hashDirMetaSync(rootDir)

        return {
            hash: hash.toString('hex'),
            path: rootDir,

            entrypoint: binary.entrypoint,
            cmd: binary.cmd,
            runEnv: binary.runEnv,
            requirements: binary.requirements,
            renvLock: binary.renvLock,
        }
    }

    private renderBinaryInfo(): binaryInfo {
        if (!this.packageInfo.hasBinary) {
            throw new Error(`pl.package.yaml file does not contain definition for binary package`)
        }

        switch (this.mode) {
            case 'release':
                break

            case 'dev-local':
                throw new Error(`'*.sw.json' generator logic error`)
                break

            default:
                assertNever(this.mode)
        }

        const binary = this.packageInfo.binary
        return {
            registry: binary.registry,
            package: binary.package,
            entrypoint: binary.entrypoint,
            cmd: binary.cmd,
            runEnv: binary.runEnv,
            requirements: binary.requirements,
            renvLock: binary.renvLock,
        }
    }

    private renderDockerInfo(): dockerInfo {
        if (!this.packageInfo.hasDocker) {
            throw new Error(`pl.package.yaml file does not contain definition for docker image`)
        }

        const docker = this.packageInfo.docker

        switch (this.mode) {
            case 'release':
                break

            case 'dev-local':
                docker.registry = 'local'
                break

            default:
                assertNever(this.mode)
        }

        return {
            image: docker.tag,
            entrypoint: docker.entrypoint,
            cmd: docker.cmd,
        }
    }
}
