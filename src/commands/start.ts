import { Command, Flags } from '@oclif/core'
import Core from '../core'
import * as cmdOpts from '../cmd-opts'
import * as util from '../util'

export default class Start extends Command {
    static override description = 'Start last run service configuraiton'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ...cmdOpts.GlobalFlags,
    }

    public async run(): Promise<void> {
        const { flags } = await this.parse(Start)

        const logger = util.createLogger(flags['log-level'])
        const core = new Core(logger)

        core.startLast()
    }
}
