import fs from 'fs'
import { spawn, SpawnOptions, ChildProcess } from 'child_process'
import state, { dockerRunInfo, processRunInfo } from './state';
import winston from 'winston';

export function runDocker(logger: winston.Logger, args: readonly string[], options: SpawnOptions, stateToSave?: dockerRunInfo): ChildProcess {
    state.lastRun = {
        ...state.lastRun,

        mode: 'docker',
        cmd: 'docker',
        args: args,
        workdir: options.cwd as string,
        envs: options.env,

        docker: {
            ...state.lastRun?.docker, 
            ...stateToSave,
        }
    }

    return run(logger, 'docker', args, options)
}

export function runProcess(logger: winston.Logger, cmd: string, args: readonly string[], options: SpawnOptions, stateToSave?: processRunInfo): ChildProcess {
    state.lastRun = {
        ...state.lastRun,

        mode: 'process',
        cmd: cmd,
        args: args,
        workdir: options.cwd as string,
        envs: options.env,

        process: {
            ...state.lastRun?.process,
            ...stateToSave,
        }
    }

    const child = run(logger, cmd, args, options)
    state.lastRun.process = {
        ...state.lastRun.process,
        pid: child.pid
    }
    return child
}

export function rerunLast(logger: winston.Logger, options: SpawnOptions): ChildProcess {
    if (!state.lastRun) {
        throw new Error("no previous run info found: this is the first run after package installation")
    }

    options = {
        cwd: state.lastRun.workdir,
        env: {
            ...state.lastRun.envs,
            ...options.env
        },
        ...options,
    }

    return run(logger, state.lastRun.cmd, state.lastRun.args, options)
}

function run(logger: winston.Logger, cmd: string, args: readonly string[], options: SpawnOptions): ChildProcess {
    logger.info(`Running:\n  env: ${JSON.stringify(options.env)}\n  cmd: ${JSON.stringify([cmd, ...args])}\n  wd: ${options.cwd}`,)

    options.env = { ...process.env, ...options.env }
    return spawn(cmd, args, options)


}
