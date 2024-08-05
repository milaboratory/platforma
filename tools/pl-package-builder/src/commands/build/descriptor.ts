import { Command, Flags } from '@oclif/core'
import { BuildFlags, BuildMode, GlobalFlags, modeFromFlag } from '../../core/flags';
import { createLogger } from '../../core/util';
import { allSoftwareSources, softwareSource } from '../../core/sw-json';
import * as actions from '../../actions'

export default class Descriptor extends Command {
    static override description = 'build *.sw.json from pl.package.yaml'

    static override examples = [
        '<%= config.bin %> <%= command.id %>',
    ]

    static override flags = {
        ...GlobalFlags,
        ...BuildFlags,

        'sources': Flags.string({
            name: "source",
            description: "add only selected sources to *.sw.json descriptor",
            options: (allSoftwareSources as unknown) as string[],
            multiple: true,
            default: [],
            required: false,
        }),
    };

    public async run(): Promise<void> {
        const { flags } = await this.parse(Descriptor);
        const mode: BuildMode = modeFromFlag(flags.dev)
        const sources = (flags.sources) as readonly softwareSource[]

        const logger = createLogger(flags['log-level'])

        actions.build.descriptor(logger, mode, sources)
    }
}
