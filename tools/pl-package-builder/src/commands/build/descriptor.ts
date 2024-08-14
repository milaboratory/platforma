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

        name: cmdOpts.DescriptorNameFlag['descriptor-name'],
        ...cmdOpts.VersionFlag,
        ...cmdOpts.SourceFlag,
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(Descriptor);
        const sources: util.SoftwareSource[] = (flags.source) ?
            (flags.source as util.SoftwareSource[]) :
            [...util.AllSoftwareSources] // we need to iterate over the list to build all targets

        const logger = util.createLogger(flags['log-level'])

        const c = new Core(logger)
        c.buildMode = cmdOpts.modeFromFlag(flags.dev as cmdOpts.devModeName)
        c.pkg.descriptorName = flags['name']
        c.pkg.version = flags.version

        c.buildDescriptor(sources)
    }
}
