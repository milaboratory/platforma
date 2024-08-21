import { Command } from '@oclif/core'
import { GlobalFlags } from '../../core/cmd-opts';
import * as cmdOpts from '../../core/cmd-opts';
import * as util from '../../core/util';
import { Core } from '../../core/core';

export default class Descriptor extends Command {
    static override description = 'publish npm package with software descriptors'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ...GlobalFlags,
    };

    static strict: boolean = false;

    public async run(): Promise<void> {
        const { argv, flags } = await this.parse(Descriptor);
        const logger = util.createLogger(flags['log-level'])

        const c = new Core(logger)

        c.publishDescriptors({
            npmPublishArgs: argv as string[],
        })
    }
}
