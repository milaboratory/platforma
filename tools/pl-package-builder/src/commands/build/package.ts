import { Command } from '@oclif/core'
import * as cmdOpts from '../../core/cmd-opts';
import * as util from '../../core/util';
import { Core } from '../../core/core';

export default class Package extends Command {
    static override description = 'Pack software into platforma package (.tgz archive for binary registry)'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ...cmdOpts.GlobalFlags,
        ...cmdOpts.BuildFlags,
        ...cmdOpts.ArchFlags,

        ...cmdOpts.ArchiveFlag,
        ...cmdOpts.ContentRootFlag,
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(Package);
        const logger = util.createLogger(flags['log-level'])

        const core = new Core(logger)

        core.buildMode = flags.modeFromFlag(flags.dev as cmdOpts.devModeName)
        core.targetOS = flags.os as util.OSType
        core.targetArch = flags.arch as util.ArchType

        core.buildPackage({archivePath: flags.archive, contentRoot: flags['content-root']})
    }
}
