import { Command } from '@oclif/core'
import { createLogger } from '../../compiler/util'
import { dumpTests } from '../../shared/dump'
import { stdout } from 'process'

export default class DumpTests extends Command {
  static override description = 'parse sources in current package and dump all found tests to stdout'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  public async run(): Promise<void> {
    const logger = createLogger()
    dumpTests(logger, stdout)
  }
}
