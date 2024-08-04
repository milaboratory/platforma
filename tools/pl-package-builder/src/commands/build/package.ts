import { Command, Args, Flags } from '@oclif/core'
import { ArchFlags, BuildFlags, GlobalFlags, } from '../../core/flags';
import { PackageInfo } from '../../core/package-info';
import * as util from '../../core/util';
import * as archive from '../../core/archive';

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

        const pkgRoot = util.findPackageRoot(logger)
        const pkg = new PackageInfo(logger, pkgRoot)

        if (!pkg.hasBinary) {
            logger.error("no 'binary' configuration found: package build is impossible for given 'pl.package.yaml' file")
            throw new Error("no 'binary' configuration")
        }

        if (flags.dev === 'local') {
            logger.info("No need to build pack software archive in 'dev=local' mode: binary build was skipped")
            return
        }

        const archiveOptions: archive.archiveOptions = {
            packageRoot: pkg.packageRoot,
            packageName: pkg.binary.name,
            packageVersion: pkg.binary.version,

            crossplatform: pkg.binary!.crossplatform,
            os: flags.os as util.OStype,
            arch: flags.arch as util.ArchType
        }

        archive.pack(logger, pkg.binary.contentRoot, archiveOptions)
    }
}
