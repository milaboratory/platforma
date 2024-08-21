import { Command } from '@oclif/core'
import * as cmdOpts from '../../core/cmd-opts';
import * as util from '../../core/util';
import { Core } from '../../core/core';

export default class Packages extends Command {
    static override description = 'publish software package archive to its registry'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ...cmdOpts.GlobalFlags,
        ...cmdOpts.ForceFlag,
        ...cmdOpts.ArchFlags,

        ...cmdOpts.PackageIDFlag,
        ...cmdOpts.VersionFlag,

        ...cmdOpts.ArchiveFlag,
        ...cmdOpts.StorageURLFlag,
        ...cmdOpts.SkipExistingPackagesFlag,
    };

    static strict: boolean = false;

    public async run(): Promise<void> {
        const { argv, flags } = await this.parse(Packages);
        const logger = util.createLogger(flags['log-level'])

        const core = new Core(logger)
        core.pkg.version = flags.version
        core.targetOS = flags.os as util.OSType
        core.targetArch = flags.arch as util.ArchType

        await core.publishPackages({
            ids: flags['package-id'],
            ignoreArchiveOverlap: flags.force,

            archivePath: flags.archive,
            storageURL: flags['storage-url'],

            skipExisting: flags['skip-existing-packages'],
            forceReupload: flags.force,
        })
    }
}
