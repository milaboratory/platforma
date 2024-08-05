import * as path from 'path';
import { Command, Flags } from '@oclif/core'
import { ArchFlags, GlobalFlags } from '../core/flags';
import * as util from '../core/util';
import { Core } from '../core/core';
import { allSoftwareSources, readSoftwareInfo } from '../core/sw-json';

export default class Publish extends Command {
    static override description = 'publish software package archive to its registry'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ...GlobalFlags,
        ...ArchFlags,

        "archive": Flags.file({
            name: "archive",
            description: "path to archive with the pacakge to be uploaded to registry. Overrides <os> and <arch> options",
            required: false,
        }),

        "publish-url": Flags.string({
            name: "publishURL",
            description: "publish package archive into given registry, specified by URL, e.g. s3://<bucket>/<some-path-prefix>?region=<region>"
        }),
    };

    static strict: boolean = false;

    public async run(): Promise<void> {
        const { argv, flags } = await this.parse(Publish);
        
        const logger = util.createLogger(flags['log-level'])

        const c = new Core(logger)
        c.targetOS = flags.os as util.OStype
        c.targetArch = flags.arch as util.ArchType

        c.publishDescriptor()

        const swInfo = readSoftwareInfo(c.pkg.packageRoot, c.pkg.name)
        
        if (swInfo.binary || flags.archive) {
            c.publishPackage({
                archivePath: flags.archive,
                publishURL: flags.publishURL,
            })
        }
        
        // TODO: add more to publish
    }
}
