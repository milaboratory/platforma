import { Command } from '@oclif/core'
import * as cmdOpts from '../core/cmd-opts';
import * as util from '../core/util';
import { Core } from '../core/core';

export default class Build extends Command {
    static override description = 'Build all targets (software descriptor, binary pacakge and so on)'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ...cmdOpts.GlobalFlags,
        ...cmdOpts.ForceFlag,

        ...cmdOpts.BuildFlags,
        ...cmdOpts.ArchFlags,
        ...cmdOpts.VersionFlag,

        ...cmdOpts.EntrypointNameFlag,
        ...cmdOpts.PackageIDFlag,
        ...cmdOpts.DirHashFlag,

        ...cmdOpts.ArchiveFlag,
        ...cmdOpts.ContentRootFlag,
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(Build);
        const logger = util.createLogger(flags['log-level'])

        const sources: util.SoftwareSource[] = (flags.source) ?
            (flags.source as util.SoftwareSource[]) :
            [...util.AllSoftwareSources] // we need to iterate over the list to build all targets

        const core = new Core(logger)

        core.buildMode = cmdOpts.modeFromFlag(flags.dev as cmdOpts.devModeName)
        core.pkg.version = flags.version
        core.targetOS = flags.os as util.OSType
        core.targetArch = flags.arch as util.ArchType
        core.fullDirHash = flags['full-dir-hash']

        core.buildDescriptors({
            ids: flags['package-id'] ? flags['package-id'] : undefined,
            entrypoints: flags.entrypoint ? flags.entrypoint : undefined,
            sources: flags.source ? flags.source as util.SoftwareSource[] : undefined,
        })

        for (const source of sources) {
            switch (source) {
                case 'binary':
                    core.buildPackages({
                        ids: flags['package-id'] ?? Array.from(core.packages.keys()),
                        forceBuild: flags.force,

                        archivePath: flags.archive,
                        contentRoot: flags['content-root'],
                        skipIfEmpty: flags['package-id'] ? false : true // do not skip 'non-binary' packages if their IDs were set as args
                    })
                    break

                // case 'docker':
                //     core.buildDocker()
                //     break

                default:
                    util.assertNever(source)
            }
        }
    }
}
