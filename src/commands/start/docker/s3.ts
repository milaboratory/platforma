import { Command } from '@oclif/core'
import Core from '../../../core'
import * as cmdOpts from '../../../cmd-opts'
import * as util from '../../../util'

export default class S3 extends Command {
  static override description = 'Run platforma backend service with \'S3\' primary storage type'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static override flags = {
    ...cmdOpts.GlobalFlags,
    ...cmdOpts.ImageFlag,
    ...cmdOpts.VersionFlag,
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(S3)

    const logger = util.createLogger(flags['log-level'])
    const core = new Core(logger)

    core.startDockerS3({
      image: flags.image,
      version: flags.version,
    })
  }
}
