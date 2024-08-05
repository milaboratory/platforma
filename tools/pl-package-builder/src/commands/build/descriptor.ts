import { Command, Flags } from '@oclif/core'
import { BuildFlags, GlobalFlags, modeFromFlag } from '../../core/flags';
import * as util from '../../core/util';
import { allSoftwareSources, softwareSource } from '../../core/sw-json';
import { Core } from '../../core/core';

export default class Descriptor extends Command {
    static override description = 'build *.sw.json from pl.package.yaml'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ...GlobalFlags,
        ...BuildFlags,

        'source': Flags.string({
            description: "add only selected sources to *.sw.json descriptor",
            options: (allSoftwareSources as unknown) as string[],
            multiple: true,
            default: [],
            required: false,
        }),
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(Descriptor);
        var sources = (flags.source) as softwareSource[]
        if (sources.length === 0) {
            sources = [...allSoftwareSources]
        }

        const logger = util.createLogger(flags['log-level'])

        const c = new Core(logger)
        c.buildMode = modeFromFlag(flags.dev)
        c.buildDescriptor(sources)
    }
}
