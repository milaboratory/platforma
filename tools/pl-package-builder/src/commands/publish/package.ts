import * as path from 'path';
import { Command, Flags } from '@oclif/core'
import { ArchFlags, GlobalFlags } from '../../core/flags';
import * as util from '../../core/util';
import { Core } from '../../core/core';

export default class Package extends Command {
    static override description = 'publish software package archive to its registry'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ...GlobalFlags,
        ...ArchFlags,

        "archive": Flags.file({
            description: "path to archive with the pacakge to be uploaded to registry. Overrides <os> and <arch> options",
            required: false,
        }),

        "publish-url": Flags.string({
            description: "publish package archive into given registry, specified by URL, e.g. s3://<bucket>/<some-path-prefix>?region=<region>"
        }),
    };

    static strict: boolean = false;

    public async run(): Promise<void> {
        const { argv, flags } = await this.parse(Package);
        const logger = util.createLogger(flags['log-level'])

        const c = new Core(logger)
        c.targetOS = flags.os as util.OSType
        c.targetArch = flags.arch as util.ArchType

        c.publishPackage({
            archivePath: flags.archive,
            publishURL: flags['publish-url'],
        })
    }
}
