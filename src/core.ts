import { spawnSync } from 'child_process'
import yaml from 'yaml';
import fs from 'fs'
import path from 'path'
import * as pkg from './package'
import * as run from './run'
import * as plCfg from './templates/config-local'
import * as platforma from './platforma'
import state from './state'
import * as util from './util'
import winston from 'winston'

export default class Core {
    private readonly assetsDirName: string = "assets"

    constructor(
        private readonly logger: winston.Logger,
    ) { }

    public startLast() {
        const child = run.rerunLast(this.logger, { stdio: 'inherit' })
        child.on('exit', (code) => {
            state.isActive = code === 0
            process.exit(code ?? 0)
        })
    }

    public startLocal(options?: {
        version?: string,
        binaryPath?: string
        configPath?: string,
        configOptions?: plCfg.configOptions,
        workdir?: string,
    }) {
        const cmd = options?.binaryPath ?? platforma.binaryPath(options?.version, "binaries", "platforma")
        var workdir = options?.workdir ?? pkg.state()
        const storageDir = options?.configOptions?.storage ?? pkg.state('./local-pl')

        for (const dir of [
            `${storageDir}/storages/main`,
            `${storageDir}/storages/library`,
            `${storageDir}/storages/work`,
            `${storageDir}/software/installed`,
            `${storageDir}/software/local`,
            `${storageDir}/blocks/local`,
        ]) {
            fs.mkdirSync(dir, { recursive: true })
        }

        var configPath = options?.configPath
        if (configPath) {
            workdir = process.cwd()
        } else {
            configPath = pkg.state("config-lastrun.yaml")
            fs.writeFileSync(configPath, plCfg.render(options?.configOptions))
        }

        const child = run.runProcess(
            this.logger,
            cmd,
            ["-config", configPath],
            {
                cwd: workdir,
                stdio: 'inherit',
            },
            {
                storagePath: options?.configOptions?.storage,
            }
        )

        child.on('exit', (code) => {
            console.log("exited")
            state.isActive = code === 0
            process.exit(code ?? 0)
        })
    }

    public startDockerS3(options?: {
        image?: string,
        version?: string,
    }) {
        const composeS3Path = pkg.assets("compose-s3.yaml")
        const image = options?.image ?? pkg.plImageTag(options?.version)

        const child = run.runDocker(
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

        child.on('exit', (code) => {
            state.isActive = code === 0
            process.exit(code ?? 0);
        });
    }

    public startDockerFS(options?: {
        primaryStorage?: string,
        libraryStorage?: string,
        image?: string,
        version?: string,
    }) {
        var composeFSPath = pkg.assets("compose-fs.yaml")
        var composeRunPath = pkg.state("compose-lastrun.yaml")
        const image = options?.image ?? pkg.plImageTag(options?.version)
        const primaryStorage = options?.primaryStorage ?? state.lastRun?.docker?.primaryPath
        const libraryStorage = options?.libraryStorage ?? state.lastRun?.docker?.libraryPath

        this.checkVolumeConfig('primary', primaryStorage, state.lastRun?.docker?.primaryPath)
        this.checkVolumeConfig('library', libraryStorage, state.lastRun?.docker?.libraryPath)

        const envs = {
            "PL_IMAGE": image,
            "PL_STORAGE_PRIMARY": "",
            "PL_STORAGE_LIBRARY": ""
        }
        const compose = this.readComposeFile(composeFSPath)

        if (primaryStorage) {
            fs.mkdirSync(path.resolve(primaryStorage), { recursive: true })
            envs["PL_STORAGE_PRIMARY"] = path.resolve(primaryStorage)
        } else {
            compose.volumes.primary = null
        }

        if (libraryStorage) {
            envs["PL_STORAGE_LIBRARY"] = path.resolve(libraryStorage)
        } else {
            compose.volumes.library = null
        }

        this.writeComposeFile(composeRunPath, compose)

        const child = run.runDocker(
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
                libraryPath: libraryStorage ? path.resolve(libraryStorage) : "",
            }
        );

        child.on('exit', (code) => {
            state.isActive = code === 0
            process.exit(code ?? 0);
        });
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
                process.exit(result.status)

            case 'process':
                state.isActive = false
                process.kill(lastRun.process!.pid!)
                process.exit(0)

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
                },
                stdio: 'inherit'
            })

        if (result.status! > 0) {
            process.exit(result.status)
        }
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
        const yamlData = fs.writeFileSync(fPath, yaml.stringify(data))
    }
}
