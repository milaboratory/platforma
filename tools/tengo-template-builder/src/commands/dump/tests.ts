import { Command } from '@oclif/core'
import { createLogger, getPackageInfo, newCompiler, parseSources } from '../../compiler/main'
import { stdout } from 'process'

export default class DumpTests extends Command {
  static override description = 'parse sources in current package and dump all found tests to stdout'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  public async run(): Promise<void> {
    const logger = createLogger()
    const packageInfo = getPackageInfo()
    
    const sources = parseSources(logger, packageInfo, 'src', '')
    
    for (const src of sources) {
      if (src.fullName.type === 'test') {
        stdout.write(JSON.stringify(src)+"\n")
      }
    }
  }
}
