import { spawn, SpawnOptions, ChildProcess } from 'child_process'
import state from './state';
import { runMode } from './state'

export function runCompose(composePath: string, args: readonly string[], options: SpawnOptions): ChildProcess {
    args = [
        'compose',
        '--file', composePath,
        ...args
    ]

    state.lastRun = {
        mode: 'docker',
        cmd: 'docker',
        composePath: composePath,
        args: args,
        envs: options.env
    }

    options.env = { ...process.env, ...options.env }

    return spawn('docker', args, options,)
}

export function rerunLast(options: SpawnOptions): ChildProcess {
    if (!state.lastRun) {
        throw new Error("no previous run info found: this is the first run after package installation")
    }

    options = {
        ...options,
        env: {
            ...process.env,
            ...state.lastRun.envs,
            ...options.env
        }
    }

    console.log(`Running:\n  env: ${JSON.stringify(state.lastRun.envs)}\n  cmd: ${JSON.stringify([state.lastRun.cmd, ...state.lastRun.args])}`, )

    return spawn(state.lastRun.cmd, state.lastRun.args, options)
}
