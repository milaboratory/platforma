import { Command } from '@oclif/core'
import * as cmdOpts from '../../../core/cmd-opts';
import * as util from '../../../core/util';
import { Core } from '../../../core/core';

export default class Path extends Command {
    static override description = 'get default path of software package archive to be built and published'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ...cmdOpts.GlobalFlags,
        ...cmdOpts.ArchFlags,

        ...cmdOpts.PackageIDRequiredFlag,
    };

    static strict: boolean = false;

    public async run(): Promise<void> {
        const { flags } = await this.parse(Path);
        const logger = util.createLogger(flags['log-level'])

        const core = new Core(logger)
        const platform = (flags.platform as util.PlatformType) ?? util.currentPlatform()

        const pkgID = flags['package-id']
        const { os, arch } = util.splitPlatform(platform)

        const pkg = core.getPackage(pkgID)

        console.log(core.archivePath(pkg, os, arch))
    }
}
