import { Command, Args, Flags } from '@oclif/core'
import { ArchFlags, BuildFlags, BuildMode, GlobalFlags, modeFromFlag } from '../../core/flags';
import { PackageInfo } from '../../core/package-info';
import * as util from '../../core/util';
import * as archive from '../../core/archive';
import { SoftwareDescriptor, allSoftwareSources, softwareSource } from '../../core/sw-json';

export default class Package extends Command {
    static override description = 'Pack software into platforma package (.tgz archive for binary registry)'

    static args = {
        'sources': Args.string({
            name: 'sources',
            required: false,
            description: 'List of sources to be avaliable in generated *.sw.json descriptor',
            options: ['binary'], // (allSoftwareSources as unknown) as string[], // <-- use this once we support docker
        })
    };

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

        logger.info("Packing software into a package")

        logger.debug(`Detecting package root...`)
        const pkgRoot = util.findPackageRoot()
        logger.debug(`  package root found at '${pkgRoot}'`)

        const pkg = new PackageInfo(logger, pkgRoot)

        if (!pkg.hasBinary) {
            logger.error("no 'binary' configuration found: package build is impossible for given pl.package.yaml file")
            throw new Error("no 'binary' configuration")
        }

        var pkgOptions: archive.pathOptions | undefined
        if (!pkg.binary.crossplatform) {
            pkgOptions = {
                os: flags.os as util.OStype,
                arch: flags.arch as util.ArchType
            }
            logger.info(`  generating package for os '${pkgOptions.os}', arch '${pkgOptions.arch}'`)
        } else {
            logger.info(`  package is marked as cross-platform, generating single package for all platforms`)
        }

        const archivePath = archive.getPath(pkg.packageRoot, pkg.binary.name, pkg.binary.version, pkgOptions)
        logger.debug(`  package content root: '${pkg.binary.contentRoot}'`)
        logger.debug(`  package destination archive: '${archivePath}'`)
        archive.create(pkg.binary.contentRoot, archivePath)

        logger.info(`Software package was written to '${archivePath}'`)
    }
}
