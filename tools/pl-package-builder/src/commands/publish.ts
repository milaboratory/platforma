import { Command } from '@oclif/core'
import * as cmdOpts from '../core/cmd-opts';
import * as util from '../core/util';
import { Core } from '../core/core';

export default class Publish extends Command {
    static override description = 'publish software package archive to its registry'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ...cmdOpts.GlobalFlags,
        ...cmdOpts.ForceFlag,
        ...cmdOpts.PlatformFlags,
        ...cmdOpts.VersionFlag,

        ...cmdOpts.ArchiveFlag,
        ...cmdOpts.StorageURLFlag,

        ...cmdOpts.PackageIDFlag,
        ...cmdOpts.SkipExistingPackagesFlag,
    };

    public async run(): Promise<void> {
        const { argv, flags } = await this.parse(Publish);
        const logger = util.createLogger(flags['log-level'])

        const core = new Core(logger)
        core.pkg.version = flags.version
        core.targetPlatform = flags.platform as util.PlatformType
        core.allPlatforms = flags['all-platforms']

        core.publishPackages({
            ids: flags['package-id'],
            ignoreArchiveOverlap: flags.force,

            archivePath: flags.archive,
            storageURL: flags['storage-url'],

            skipExisting: flags['skip-existing-packages'],
            forceReupload: flags.force,
        })

        core.publishDescriptors()

        // TODO: don't forget to add docker here, when we support it
    }
}
