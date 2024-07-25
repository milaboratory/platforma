import { existsSync, writeFileSync } from 'fs'
import * as pkg from './package'
import { resolve } from 'path'

export type runMode = 'docker'

export type lastRun = {
    mode: runMode
    composePath: string
    cmd: string
    args: readonly string[]
    envs: NodeJS.Dict<string> | undefined
}


type state = {
    lastRun: lastRun | undefined
    isActive: boolean
}

class State {
    private static instance: State;

    private state: state = {
        lastRun: undefined,
        isActive: false,
    }

    private stateFilePath: string

    constructor() {
        this.stateFilePath = resolve(pkg.path("state.json"))

        if (existsSync(this.stateFilePath)) {
            this.state = JSON.parse(pkg.readFileSync(this.stateFilePath).toString())
        }
    }

    public static getInstance(): State {
        if (!State.instance) {
            State.instance = new State();
        }

        return State.instance;
    }

    private writeState() {
        writeFileSync(this.stateFilePath, JSON.stringify(this.state))
    }

    get isActive(): boolean {
        return this.state.isActive
    }

    set isActive(value: boolean) {
        this.state.isActive = value
        this.writeState()
    }

    get lastRun(): lastRun | undefined {
        return this.state.lastRun
    }

    set lastRun(info: lastRun) {
        this.state.lastRun = info
        this.writeState()
    }
}

export default State.getInstance();
