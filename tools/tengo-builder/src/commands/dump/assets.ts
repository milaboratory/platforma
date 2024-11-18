import { Command } from '@oclif/core'
import { createLogger } from '../../compiler/util'
import { dumpAssets } from '../../shared/dump'
import { stdout } from 'process'

export default class DumpAssets extends Command {
  static override description = 'parse sources in current package and dump all found tests to stdout'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  public async run(): Promise<void> {
    const logger = createLogger()
    dumpAssets(logger, stdout)
  }
}
