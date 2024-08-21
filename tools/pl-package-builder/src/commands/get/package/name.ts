import { Command, Flags } from '@oclif/core'
import * as cmdOpts from '../../../core/cmd-opts';
import * as util from '../../../core/util';
import { Core } from '../../../core/core';

export default class Name extends Command {
    static override description = 'get the name of software package to be built and published'

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
        const { flags } = await this.parse(Name);
        const logger = util.createLogger(flags['log-level'])

        const core = new Core(logger)

        const pkg = core.getPackage(flags['package-id'])
        if (pkg.binary) {
            console.log(pkg.binary.fullName(
                flags.os as util.OSType,
                flags.arch as util.ArchType
            ))
        }

        if (pkg.environment) {
            console.log(pkg.environment.fullName(
                flags.os as util.OSType,
                flags.arch as util.ArchType
            ))
        }

        logger.error(`Package '${flags['package-id']}' have no software archive build settings ('binary' or 'environment')`)
        process.exit(1)
    }
}
