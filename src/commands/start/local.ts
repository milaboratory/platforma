import { Command } from '@oclif/core'
import path from 'path'
import Core from '../../core'
import * as cmdOpts from '../../cmd-opts'
import * as platforma from '../../platforma'
import * as util from '../../util'

export default class Local extends Command {
  static override description = 'Run Platforma Backend service as local process on current host (no docker container)'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static override flags = {
    ...cmdOpts.VersionFlag,
    ...cmdOpts.StorageFlag,
    ...cmdOpts.ConfigFlag,
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Local)

    const logger = util.createLogger(flags['log-level'])
    const core = new Core(logger)

    const storage = flags.storage ? path.resolve(flags.storage) : undefined

    platforma.getBinary(logger, { version: flags.version }).then(
      () => core.startLocal({
        version: flags.version,
        configPath: flags.config,
        configOptions: {
          logstdout: true,
          storage: storage
        }
      })
    )
  }
}
