import { Command, Flags } from '@oclif/core'
import * as pkg from '../package'
import { assertNever } from '../util'
import { rerunLast } from '../run'
import state from '../state'

export default class Stop extends Command {
    static override description = 'Run platforma backend service with \'S3\' primary storage type'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    public async run(): Promise<void> {
        const child = rerunLast({stdio: 'inherit'})
        child.on('exit', (code) => {
            process.exit(code ?? 0)
        })
    }
}
