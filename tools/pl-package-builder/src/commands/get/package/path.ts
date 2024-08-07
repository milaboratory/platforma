import { Command } from '@oclif/core'
import { ArchFlags, GlobalFlags } from '../../../core/cmd-opts';
import * as util from '../../../core/util';
import { Core } from '../../../core/core';

export default class Path extends Command {
    static override description = 'get default path of software package archive to be built and published'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ...GlobalFlags,
        ...ArchFlags,
    };

    static strict: boolean = false;

    public async run(): Promise<void> {
        const { flags } = await this.parse(Path);
        const logger = util.createLogger(flags['log-level'])

        const core = new Core(logger)
        core.targetOS = flags.os as util.OSType
        core.targetArch = flags.arch as util.ArchType

        console.log(core.archivePath)
    }
}
