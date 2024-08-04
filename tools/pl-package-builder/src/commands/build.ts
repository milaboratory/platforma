import { Command, Args, Flags } from '@oclif/core'
import { ArchFlags, BuildFlags, GlobalFlags, BuildMode, modeFromFlag } from '../core/flags';
import { PackageInfo } from '../core/package-info';
import { SoftwareDescriptor, allSoftwareSources, softwareSource } from '../core/sw-json';
import * as util from '../core/util';
import * as archive from '../core/archive';

export default class Build extends Command {
    static override description = 'Build all targets (software descriptor, binary pacakge and so on)'

    static args = {
        'sources': Args.string({
            name: 'sources',
            required: false,
            description: 'List of sources to be avaliable in generated *.sw.json descriptor',
            options: (allSoftwareSources as unknown) as string[],
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
        const { args, flags } = await this.parse(Build);
        const mode: BuildMode = modeFromFlag(flags.dev)

        const logger = util.createLogger(flags['log-level'])

        const pkgRoot = util.findPackageRoot(logger)
        const pkg = new PackageInfo(logger, pkgRoot)
        const sw = new SoftwareDescriptor(logger, pkg, mode)

        var sources: readonly softwareSource[] = allSoftwareSources
        if (args.sources) {
            sources = [args.sources] as readonly softwareSource[]
        }

        const swJson = sw.render(...sources)
        sw.write(swJson)

        for (const source of sources) {
            switch (source) {
                case 'binary':
                    if (!pkg.hasBinary) {
                        logger.error("no 'binary' configuration found: package build is impossible for given 'pl.package.yaml' file")
                        throw new Error("no 'binary' configuration")
                    }

                    if (flags.dev === 'local') {
                        logger.info("  no need to build pack software archive in 'dev=local' mode: binary build was skipped")
                        break
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
                    break

                // case 'docker':
                //     if (!pkg.hasDocker) {
                //         logger.error("no 'docker' configuration found: package build is impossible for given 'pl.package.yaml' file")
                //         throw new Error("no 'docker' configuration")
                //     }
                //
                //     break

                default:
                    util.assertNever(source)
            }
        }
    }
}
