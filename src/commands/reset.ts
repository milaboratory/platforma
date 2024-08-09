import { Command, Flags } from '@oclif/core'
import Core from '../core'
import * as cmdOpts from '../cmd-opts'
import * as util from '../util'


export default class Reset extends Command {
    static override description = 'Clear service state (forget last run command, destroy docker services, volumes and so on)'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ...cmdOpts.GlobalFlags,
    }

    public async run(): Promise<void> {
        const { flags } = await this.parse(Reset)

        const logger = util.createLogger(flags['log-level'])
        const core = new Core(logger)
        core.cleanup()
    }
}

