import { Command } from '@oclif/core'
import { compile, savePacks, createLogger } from '../compiler/main'
import { GlobalFlags } from '../shared/basecmd'

export default class Build extends Command {
  static override description = 'build tengo sources into single distributable pack file'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static override flags = { ...GlobalFlags }

  public async run(): Promise<void> {
    const {flags} = await this.parse(Build)
    const logger = createLogger(flags['log-level'])

    const compiled = compile(logger)
    savePacks(logger, compiled)

    logger.info("Template Pack build done.")
  }
}
