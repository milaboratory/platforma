import { Command, Flags } from '@oclif/core'
import { ArchFlags, BuildFlags, GlobalFlags, modeFromFlag, } from '../../core/flags';
import * as util from '../../core/util';
import { Core } from '../../core/core';

export default class Package extends Command {
    static override description = 'Pack software into platforma package (.tgz archive for binary registry)'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ...GlobalFlags,
        ...BuildFlags,
        ...ArchFlags,

        "content-root": Flags.directory({
            description: "path to directory with contents of software package. Overrides settings in pl.package.yaml"
        })
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(Package);
        const logger = util.createLogger(flags['log-level'])

        const core = new Core(logger)

        core.buildMode = modeFromFlag(flags.dev)
        core.targetOS = flags.os as util.OSType
        core.targetArch = flags.arch as util.ArchType

        core.buildPackage({contentRoot: flags['content-root']})
    }
}
