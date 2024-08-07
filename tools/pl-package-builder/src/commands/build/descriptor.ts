import { Command } from '@oclif/core'
import * as flags from '../../core/flags';
import * as util from '../../core/util';
import { Core } from '../../core/core';

export default class Descriptor extends Command {
    static override description = 'build *.sw.json from pl.package.yaml'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ...flags.GlobalFlags,
        ...flags.BuildFlags,

        ...flags.SourceFlag,
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(Descriptor);
        var sources = (flags.source) as util.SoftwareSource[]
        if (sources.length === 0) {
            sources = [...util.AllSoftwareSources]
        }

        const logger = util.createLogger(flags['log-level'])

        const c = new Core(logger)
        c.buildMode = flags.modeFromFlag(flags.dev as flags.devModeName)
        c.buildDescriptor(sources)
    }
}
