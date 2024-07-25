import { Command, Flags } from '@oclif/core'
import * as pkg from '../package'
import { assertNever } from '../util'
import { spawnSync } from 'child_process'
import state from '../state'

export default class Stop extends Command {
    static override description = 'Stop platforma service'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    public async run(): Promise<void> {
        if (!state.isActive) {
            console.log("no running service detected")
            return
        }

        const lastRun = state.lastRun!

        switch (lastRun.mode) {
            case 'docker':
                const result = spawnSync(
                    'docker',
                    ['compose', '--file', lastRun.composePath!, 'down'],
                    {
                        env: {
                            ...process.env,
                            ...lastRun.envs
                        },
                        stdio: 'inherit'
                    },
                )
                process.exit(result.status)

            default:
                assertNever(lastRun.mode)
        }
    }
}
