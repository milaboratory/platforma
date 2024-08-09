import { Command } from '@oclif/core'
import Core from '../../../core'
import * as cmdOpts from '../../../cmd-opts'
import * as util from '../../../util'

export default class FS extends Command {
  static override description = 'Run platforma backend service with \'FS\' primary storage type'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static override flags = {
    ...cmdOpts.ImageFlag,
    ...cmdOpts.VersionFlag,
    ...cmdOpts.StoragePrimaryFlag,
    ...cmdOpts.StorageLibraryFlag,
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(FS)

    const logger = util.createLogger(flags['log-level'])
    const core = new Core(logger)
    core.startDockerFS({
      primaryStorage: flags['storage-primary'],
      libraryStorage: flags['storage-library'],
      
      image: flags.image,
      version: flags.version,
    })
  }
}
