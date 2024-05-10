import { Command } from '@oclif/core'
import { compile, savePacks, createLogger } from '../compiler/main'

export default class Build extends Command {
  static override description = 'build tengo sources into single distributable pack file'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  public async run(): Promise<void> {
    const logger = createLogger()

    const compiled = compile(logger)
    savePacks(logger, compiled)
  }
}
