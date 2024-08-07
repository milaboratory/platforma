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
        ...cmdOpts.BuildFlags,
        ...cmdOpts.ArchFlags,

        ...cmdOpts.ArchiveFlag,
        ...cmdOpts.ContentRootFlag,
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(Build);
        var sources = (flags.source) as util.SoftwareSource[]
        if (sources.length === 0) {
            sources = [...util.AllSoftwareSources] // we need to iterate over the list to build all targets
        }

        const logger = util.createLogger(flags['log-level'])
        const core = new Core(logger)

        core.buildMode = flags.modeFromFlag(flags.dev as cmdOpts.devModeName)
        core.targetOS = flags.os as util.OSType
        core.targetArch = flags.arch as util.ArchType

        core.buildDescriptor(sources)

        for (const source of sources) {
            switch (source) {
                case 'binary':
                    core.buildPackage({ archivePath: flags.archive, contentRoot: flags['content-root'] })
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
