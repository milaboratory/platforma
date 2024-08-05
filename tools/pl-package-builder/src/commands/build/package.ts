import { Command } from '@oclif/core'
import { ArchFlags, BuildFlags, GlobalFlags, } from '../../core/flags';
import * as util from '../../core/util';
import * as actions from '../../actions'

export default class Package extends Command {
    static override description = 'Pack software into platforma package (.tgz archive for binary registry)'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ...GlobalFlags,
        ...BuildFlags,
        ...ArchFlags,
    };

    public async run(): Promise<void> {
        const { args, flags } = await this.parse(Package);

        const logger = util.createLogger(flags['log-level'])

        if (flags.dev === 'local') {
            logger.info("No need to build pack software archive in 'dev=local' mode: binary build was skipped")
            return
        }

        actions.build.packageArchive(logger, {
            os: flags.os as util.OStype,
            arch: flags.arch as util.ArchType,
        })
    }
}
