import { Command } from '@oclif/core'
import * as cmdOpts from '../../core/cmd-opts';
import * as util from '../../core/util';
import { Core } from '../../core/core';

export default class Package extends Command {
    static override description = 'publish software package archive to its registry'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ...cmdOpts.GlobalFlags,
        ...cmdOpts.ArchFlags,

        ...cmdOpts.VersionFlag,
        ...cmdOpts.ArchiveFlag,

        ...cmdOpts.StorageURLFlag,
        ...cmdOpts.PackageNameFlag,
    };

    static strict: boolean = false;

    public async run(): Promise<void> {
        const { argv, flags } = await this.parse(Package);
        const logger = util.createLogger(flags['log-level'])

        const core = new Core(logger)
        core.pkg.version = flags.version
        core.targetOS = flags.os as util.OSType
        core.targetArch = flags.arch as util.ArchType
        if (flags['package-name']) core.packageName = flags['package-name']

        core.publishPackage({
            archivePath: flags.archive,
            storageURL: flags['storage-url'],
        })
    }
}
