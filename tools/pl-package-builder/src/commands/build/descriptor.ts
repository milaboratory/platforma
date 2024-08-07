import { Command } from '@oclif/core'
import * as cmdOpts from '../../core/cmd-opts';
import * as util from '../../core/util';
import { Core } from '../../core/core';

export default class Descriptor extends Command {
    static override description = 'build *.sw.json from pl.package.yaml'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ...cmdOpts.GlobalFlags,
        ...cmdOpts.BuildFlags,

        ...cmdOpts.SourceFlag,
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(Descriptor);
        var sources = (flags.source) as util.SoftwareSource[]
        if (sources.length === 0) {
            sources = [...util.AllSoftwareSources]
        }

        const logger = util.createLogger(flags['log-level'])

        const c = new Core(logger)
        c.buildMode = cmdOpts.modeFromFlag(flags.dev as cmdOpts.devModeName)
        c.buildDescriptor(sources)
    }
}
