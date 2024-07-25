import { Command, Flags } from '@oclif/core'
import { spawnSync } from 'child_process'
import { rmSync } from 'fs'
import * as pkg from '../package'
import { assertNever } from '../util'
import { rerunLast } from '../run'
import state from '../state'
import { askYN } from '../util'
import { inherits } from 'util'


export default class Reset extends Command {
    static override description = 'Clear service state (forget last run command, destroy docker services, volumes and so on)'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    public async run(): Promise<void> {
        const removeWarns = [
            'last command run cache (pl-service run)',
            `'platforma' docker compose service containers and volumes`
        ]
        if (state.lastRun?.storageDir) {
            removeWarns.push(`storage directory '${state.lastRun?.storageDir!}'`)
        }


        var warnMessage = `
You are going to reset the state of platforma service
Things to be removed:
  - ${removeWarns.join("\n  - ")}
`
        console.log(warnMessage)
        if (!askYN("Are you sure?")) {
            console.log("Reset action was canceled")
            return
        }

        const composeToDestroy = new Set<string>(pkg.composeFiles())
        if (state.lastRun?.composePath) {
            composeToDestroy.add(state.lastRun.composePath)
        }

        for (const composeFile of composeToDestroy) {
            console.log(`Destroying docker compose ${composeFile}`)
            destroyCompose(composeFile, pkg.plImageTag())
        }

        if (state.lastRun?.storageDir) {
            console.log(`Destroying storage dir ${state.lastRun.storageDir}`)
            rmSync(state.lastRun.storageDir, { recursive: true, force: true })
        }

        console.log(`Removing state file ${state.stateFilePath}`)
        rmSync(state.stateFilePath, { force: true })
    }
}

function destroyCompose(composePath: string, image: string) {
    const result = spawnSync(
        'docker',
        ['compose', '--file', composePath, 'down', '--volumes', '--remove-orphans'],
        {
            env: {
                ...process.env,
                "PL_IMAGE": "scratch",
                "PL_STORAGE_PATH": "",
            },
            stdio: 'inherit'
        })

    if (result.status! > 0) {
        process.exit(result.status)
    }
}

