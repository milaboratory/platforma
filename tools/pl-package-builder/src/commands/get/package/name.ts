import { Command } from '@oclif/core'
import { ArchFlags, GlobalFlags } from '../../../core/cmd-opts';
import * as util from '../../../core/util';
import { Core } from '../../../core/core';

export default class Name extends Command {
    static override description = 'get the name of software package to be built and published'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ...GlobalFlags,
        ...ArchFlags,
    };

    static strict: boolean = false;

    public async run(): Promise<void> {
        const { flags } = await this.parse(Name);
        const logger = util.createLogger(flags['log-level'])

        const core = new Core(logger)

        console.log(core.pkg.binary.fullName(
            flags.os as util.OSType,
            flags.arch as util.ArchType
        ))
    }
}
