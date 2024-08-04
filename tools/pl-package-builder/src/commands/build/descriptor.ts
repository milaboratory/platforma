import { Command, Args, Flags } from '@oclif/core'
import { BuildFlags, BuildMode, GlobalFlags, modeFromFlag } from '../../core/flags';
import { PackageInfo } from '../../core/package-info';
import { createLogger, findPackageRoot } from '../../core/util';
import { SoftwareDescriptor, allSoftwareSources, softwareSource } from '../../core/sw-json';

export default class Descriptor extends Command {
    static override description = 'build *.sw.json from pl.package.yaml'

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
    };

    public async run(): Promise<void> {
        const { args, flags } = await this.parse(Descriptor);
        const mode: BuildMode = modeFromFlag(flags.dev)

        const logger = createLogger(flags['log-level'])

        const pkgRoot = findPackageRoot(logger)

        const pkg = new PackageInfo(logger, pkgRoot)
        const sw = new SoftwareDescriptor(logger, pkg, mode)

        var sources: readonly softwareSource[] = allSoftwareSources
        if (args.sources) {
            sources = [args.sources] as readonly softwareSource[]
        }

        const swJson = sw.render(...sources)
        sw.write(swJson)
    }
}
