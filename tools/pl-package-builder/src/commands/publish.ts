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
        ...cmdOpts.ArchFlags,
        ...cmdOpts.VersionFlag,

        ...cmdOpts.ArchiveFlag,
        ...cmdOpts.StorageURLFlag,

        ...cmdOpts.PackageIDFlag,
    };

    static strict: boolean = false;

    public async run(): Promise<void> {
        const { argv, flags } = await this.parse(Publish);
        const logger = util.createLogger(flags['log-level'])

        const core = new Core(logger)
        core.pkg.version = flags.version
        core.targetOS = flags.os as util.OSType
        core.targetArch = flags.arch as util.ArchType

        core.publishPackages({
            ids: flags['package-id'],
            forcePublish: flags.force,

            archivePath: flags.archive,
            storageURL: flags['storage-url'],
        })

        core.publishDescriptors()

        // TODO: don't forget to add docker here, when we support it
    }
}
