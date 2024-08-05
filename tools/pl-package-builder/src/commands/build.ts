import { Command, Args, Flags } from '@oclif/core'
import { ArchFlags, BuildFlags, GlobalFlags, BuildMode, modeFromFlag } from '../core/flags';
import { PackageInfo } from '../core/package-info';
import { SoftwareDescriptor, allSoftwareSources, softwareSource } from '../core/sw-json';
import * as util from '../core/util';
import * as archive from '../core/archive';
import { Core } from '../core/core';

export default class Build extends Command {
    static override description = 'Build all targets (software descriptor, binary pacakge and so on)'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ...GlobalFlags,
        ...BuildFlags,
        ...ArchFlags,

        'source': Flags.string({
            description: "add only selected sources to *.sw.json descriptor",
            options: (allSoftwareSources as unknown) as string[],
            multiple: true,
            default: [],
            required: false,
        }),
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(Build);
        var sources = (flags.source) as softwareSource[]
        if (sources.length === 0) {
            sources = [...allSoftwareSources] // we need to iterate over the list to build all targets
        }

        const logger = util.createLogger(flags['log-level'])
        const core = new Core(logger)

        core.buildMode = modeFromFlag(flags.dev)
        core.targetOS = flags.os as util.OStype
        core.targetArch = flags.arch as util.ArchType

        core.buildDescriptor(sources)

        for (const source of sources) {
            switch (source) {
                case 'binary':
                    core.buildPackage()
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
