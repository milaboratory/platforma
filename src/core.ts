import { ChildProcess, SpawnSyncReturns, spawn, spawnSync } from 'child_process'
import yaml from 'yaml';
import fs from 'fs'
import path from 'path'
import * as pkg from './package'
import * as run from './run'
import * as plCfg from './templates/pl-config'
import * as platforma from './platforma'
import * as types from './templates/types'
import state from './state'
import * as util from './util'
import winston from 'winston'

export default class Core {
    constructor(
        private readonly logger: winston.Logger,
    ) { }

    public startLast() {
        const result = run.rerunLast(this.logger, { stdio: 'inherit' })
        this.checkRunError(result, "failed to bring back Platforma Backend in the last started configuration")
    }

    public startLocal(options?: startLocalOptions): ChildProcess {
        const cmd = options?.binaryPath ?? platforma.binaryPath(options?.version, "binaries", "platforma")
        var configPath = options?.configPath
        const workdir: string = options?.workdir ?? (configPath ? process.cwd() : pkg.state())

        if (options?.primaryURL) {
            options.configOptions = {
                ...options.configOptions,
                storages: {
                    ...options.configOptions?.storages,
                    primary: plCfg.storageSettingsFromURL(options.primaryURL, workdir),
                }
            }
        }
        if (options?.libraryURL) {
            options.configOptions = {
                ...options.configOptions,
                storages: {
                    ...options.configOptions?.storages,
                    library: plCfg.storageSettingsFromURL(options.libraryURL, workdir),
                }
            }
        }

        const configOptions = plCfg.loadDefaults(options?.configOptions)

        const storageDirs: string[] = [
            `${configOptions.localRoot}/software/installed`,
            `${configOptions.localRoot}/software/local`,
            `${configOptions.localRoot}/blocks/local`,
        ]
        if (configOptions.storages.primary.type === 'FS') {
            storageDirs.push(configOptions.storages.primary.rootPath)
        }
        if (configOptions.storages.library.type === 'FS') {
            storageDirs.push(configOptions.storages.library.rootPath)
        }
        if (configOptions.storages.work.type === 'FS') {
            storageDirs.push(configOptions.storages.work.rootPath)
        }

        for (const dir of storageDirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true })
            }
        }

        for (const drv of configOptions.core.auth.drivers) {
            if (drv.driver === 'htpasswd') {
                if (!fs.existsSync(drv.path)) {
                    fs.copyFileSync(pkg.assets("users.htpasswd"), drv.path)
                }
            }
        }

        if (!configPath) {
            configPath = pkg.state("config-lastrun.yaml")
            fs.writeFileSync(configPath, plCfg.render(configOptions))
        }

        return run.runProcess(
            this.logger,
            cmd,
            ["-config", configPath],
            {
                cwd: workdir,
                stdio: 'inherit',
            },
            {
                storagePath: configOptions.localRoot,
            }
        )
    }

    public startLocalFS(options?: startLocalFSOptions): ChildProcess {
        return this.startLocal(options)
    }

    public startLocalS3(options?: startLocalOptions): ChildProcess {
        if (!options?.libraryURL || !options?.primaryURL) {
            this.startMinio()
        }

        if (!options?.primaryURL) {
            options = {
                ...options,
                primaryURL: "s3e://testuser:testpassword@localhost:9000/main-bucket/?region=fake-region"
            }
        }
        if (!options?.libraryURL) {
            options = {
                ...options,
                libraryURL: "s3e://testuser:testpassword@localhost:9000/library-bucket/?region=fake-region"
            }
        }

        return this.startLocal(options)
    }

    public startMinio(options?: {
        storage?: string,
        image?: string,
        version?: string,
    }) {
        var composeMinioSrc = pkg.assets("compose-minio.yaml")
        var composeMinioDst = pkg.state("compose-minio.yaml")

        const version = options?.version ? `:${options.version!}` : ""
        const image = options?.image ?? `quay.io/minio/minio${version}`

        const storage = options?.storage

        const envs = {
            "MINIO_IMAGE": image,
            "MINIO_STORAGE": "",
        }
        const compose = this.readComposeFile(composeMinioSrc)

        if (storage) {
            fs.mkdirSync(path.resolve(storage), { recursive: true })
            envs["MINIO_STORAGE"] = path.resolve(storage)
        } else {
            compose.volumes.storage = null
        }

        this.writeComposeFile(composeMinioDst, compose)

        const result = spawnSync(
            'docker',
            ['compose', `--file=${composeMinioDst}`,
                'up',
                '--detach',
                '--remove-orphans',
                '--pull=missing'],
            {
                env: {
                    ...process.env,
                    ...envs
                },
                stdio: 'inherit'
            },
        )

        this.checkRunError(result, "failed to start MinIO service in docker")
    }

    public startDockerS3(options?: {
        image?: string,
        version?: string,
    }) {
        const composeS3Path = pkg.assets("compose-s3.yaml")
        const image = options?.image ?? pkg.plImageTag(options?.version)

        const result = run.runDocker(
            this.logger,
            ['compose', `--file=${composeS3Path}`,
                'up',
                '--detach',
                '--remove-orphans',
                '--pull=missing',
                'backend'],
            {
                env: {
                    "PL_IMAGE": image,
                },
                stdio: 'inherit'
            },
            {
                plImage: image,
                composePath: composeS3Path
            }
        );

        this.checkRunError(result, "failed to start Platforma Backend in Docker")
        state.isActive = true
    }

    public startDockerFS(options?: {
        primaryStorage?: string,
        workStorage?: string,
        libraryStorage?: string,
        image?: string,
        version?: string,
    }) {
        var composeFSPath = pkg.assets("compose-fs.yaml")
        var composeRunPath = pkg.state("compose-fs.yaml")
        const image = options?.image ?? pkg.plImageTag(options?.version)
        const primaryStorage = options?.primaryStorage ?? state.lastRun?.docker?.primaryPath
        const workStorage = options?.workStorage ?? state.lastRun?.docker?.workPath
        const libraryStorage = options?.libraryStorage ?? state.lastRun?.docker?.libraryPath

        this.checkVolumeConfig('primary', primaryStorage, state.lastRun?.docker?.primaryPath)
        this.checkVolumeConfig('library', libraryStorage, state.lastRun?.docker?.libraryPath)

        const envs = {
            "PL_IMAGE": image,
            "PL_STORAGE_PRIMARY": "",
            "PL_STORAGE_WORK": "",
            "PL_STORAGE_LIBRARY": ""
        }
        const compose = this.readComposeFile(composeFSPath)

        if (primaryStorage) {
            fs.mkdirSync(path.resolve(primaryStorage), { recursive: true })
            envs["PL_STORAGE_PRIMARY"] = path.resolve(primaryStorage)
        } else {
            compose.volumes.primary = null
        }

        if (workStorage) {
            fs.mkdirSync(path.resolve(workStorage), { recursive: true })
            envs["PL_STORAGE_PRIMARY"] = path.resolve(workStorage)
        } else {
            compose.volumes.work = null
        }

        if (libraryStorage) {
            envs["PL_STORAGE_LIBRARY"] = path.resolve(libraryStorage)
        } else {
            compose.volumes.library = null
        }

        this.writeComposeFile(composeRunPath, compose)

        const result = run.runDocker(
            this.logger,
            ['compose', `--file=${composeFSPath}`,
                'up',
                '--detach',
                '--remove-orphans',
                '--pull=missing',
                'backend'],
            {
                env: envs,
                stdio: 'inherit'
            },
            {
                plImage: image,
                composePath: composeFSPath,
                primaryPath: primaryStorage ? path.resolve(primaryStorage) : "",
                workPath: workStorage ? path.resolve(workStorage) : "",
                libraryPath: libraryStorage ? path.resolve(libraryStorage) : "",
            }
        );

        this.checkRunError(result, "failed to start Platforma Backend in Docker")
        state.isActive = true
    }

    public stop() {
        if (!state.isActive) {
            console.log("no running service detected")
            return
        }

        const lastRun = state.lastRun!

        switch (lastRun.mode) {
            case 'docker':
                const result = spawnSync(
                    'docker',
                    ['compose', '--file', lastRun.docker!.composePath!, 'down'],
                    {
                        env: {
                            ...process.env,
                            ...lastRun.envs
                        },
                        stdio: 'inherit'
                    },
                )
                state.isActive = false
                if (result.status !== 0) process.exit(result.status)
                return

            case 'process':
                state.isActive = false
                process.kill(lastRun.process!.pid!)
                return

            default:
                util.assertNever(lastRun.mode)
        }
    }

    public cleanup() {
        const removeWarns = [
            "last command run cache ('pl-service start' shorthand will stop working until next full start command call)",
            `'platforma' docker compose service containers and volumes`,
        ]
        const dirsToRemove: string[] = []
        if (state.lastRun?.docker?.primaryPath) {
            dirsToRemove.push(state.lastRun!.docker!.primaryPath!)
        }
        if (state.lastRun?.process?.storagePath) {
            dirsToRemove.push(state.lastRun!.process!.storagePath!)
        }
        const storageWarns = dirsToRemove.length > 0 ?
            `  - storages (you'll loose all projects and calculation results stored in the service instance):\n    - ${dirsToRemove.join('\n    - ')}` : ''

        var warnMessage = `
You are going to reset the state of platforma service
Things to be removed:
  - ${removeWarns.join("\n  - ")}
${storageWarns}
`
        this.logger.warn(warnMessage)
        if (!util.askYN("Are you sure?")) {
            this.logger.info("Reset action was canceled")
            return
        }

        const composeToDestroy = new Set<string>(pkg.composeFiles())
        if (state.lastRun?.docker?.composePath) {
            composeToDestroy.add(state.lastRun.docker.composePath)
        }

        for (const composeFile of composeToDestroy) {
            this.logger.info(`Destroying docker compose '${composeFile}'`)
            this.destroyDocker(composeFile, pkg.plImageTag())
        }

        for (const dir of dirsToRemove) {
            this.logger.info(`Destroying '${dir}'`)
            fs.rmSync(dir, { recursive: true, force: true })
        }

        this.logger.info(`Destroying state dir '${pkg.state()}'`)
        fs.rmSync(pkg.state(), { recursive: true, force: true })

        this.logger.info(`\nIf you want to remove all downloaded platforma binaries, delete '${pkg.binaries()}' dir manually\n`)
    }

    private destroyDocker(composePath: string, image: string) {
        const result = spawnSync(
            'docker',
            ['compose', '--file', composePath, 'down', '--volumes', '--remove-orphans'],
            {
                env: {
                    ...process.env,
                    "PL_IMAGE": "scratch",
                    "PL_STORAGE_PRIMARY": "",
                    "PL_STORAGE_LIBRARY": "",

                    "MINIO_IMAGE": "scratch",
                    "MINIO_STORAGE": "",
                },
                stdio: 'inherit'
            })

        if (result.status !== 0) process.exit(result.status)
    }

    private checkVolumeConfig(volumeID: string, newPath?: string, lastRunPath?: string) {
        if (newPath === undefined) {
            return
        }
        if (lastRunPath === undefined) {
            return
        }

        if (path.resolve(newPath) == path.resolve(lastRunPath)) {
            return
        }

        this.logger.error(`'${volumeID}' storage is given to Platforma Backend as docker volume.\n` +
            `Docker Compose does not migrate volumes on itself. It seems you used different path for '${volumeID}' storage earlier.\n` +
            `  current bind path: '${lastRunPath}'\n` +
            `  new bind path:     '${path.resolve(newPath)}'\n` +
            `Your '${volumeID}' storage path change would not have effect until reset (pl-service reset)`
        )
        throw new Error(`cannot change '${volumeID}' storage path`)
    }

    private readComposeFile(fPath: string): any {
        const yamlData = fs.readFileSync(fPath)
        return yaml.parse(yamlData.toString())
    }
    private writeComposeFile(fPath: string, data: any) {
        fs.writeFileSync(fPath, yaml.stringify(data))
    }

    private checkRunError(result: SpawnSyncReturns<Buffer>, message?: string) {
        if (result.error) {
            throw result.error
        }

        const msg = message ?? "failed to run command"

        if (result.status !== 0) {
            throw new Error(`${msg}, process exited with code '${result.status}'`)
        }
    }
}

export type startLocalFSOptions = {
    version?: string,
    binaryPath?: string
    configPath?: string,
    configOptions?: plCfg.plOptions,
    workdir?: string,
}

export type startLocalOptions = startLocalFSOptions & {
    primaryURL?: string,
    libraryURL?: string,
}
