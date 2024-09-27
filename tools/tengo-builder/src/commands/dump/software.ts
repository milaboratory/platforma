import { Command } from '@oclif/core'
import { createLogger } from '../../compiler/main'
import { dumpSoftware } from '../../shared/dump'
import { stdout } from 'process'

export default class DumpSoftware extends Command {
  static override description = 'parse sources in current package and dump all found tests to stdout'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  public async run(): Promise<void> {
    const logger = createLogger()
    dumpSoftware(logger, stdout)
  }
}
