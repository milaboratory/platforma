import { Command } from '@oclif/core'
import * as flags from '../core/flags';
import * as util from '../core/util';
import { Core } from '../core/core';
import { readSoftwareInfo } from '../core/sw-json';

export default class Publish extends Command {
    static override description = 'publish software package archive to its registry'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ...flags.GlobalFlags,
        ...flags.ArchFlags,

        ...flags.ArchiveFlag,
        ...flags.StorageURLFlag,
    };

    static strict: boolean = false;

    public async run(): Promise<void> {
        const { argv, flags } = await this.parse(Publish);
        
        const logger = util.createLogger(flags['log-level'])

        const c = new Core(logger)
        c.targetOS = flags.os as util.OSType
        c.targetArch = flags.arch as util.ArchType

        c.publishDescriptor()

        const swInfo = readSoftwareInfo(c.pkg.packageRoot, c.pkg.name)
        
        if (swInfo.binary || flags.archive) {
            c.publishPackage({
                archivePath: flags.archive,
                storageURL: flags.publishURL,
            })
        }
        
        // TODO: don't forget to add docker here, when we support it
    }
}
