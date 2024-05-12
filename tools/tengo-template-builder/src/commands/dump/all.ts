import { Command } from '@oclif/core'
import { createLogger, getPackageInfo, newCompiler, parseSources } from '../../compiler/main'
import { stdout } from 'process'

export default class DumpAll extends Command {
  static override description = 'parse sources in current package and dump all found artifacts to stdout'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  public async run(): Promise<void> {
    const logger = createLogger()
    const packageInfo = getPackageInfo()
    
    const sources = parseSources(logger, packageInfo, 'src', '')

    const compiler = newCompiler(logger, packageInfo)
    for (const src of sources) {
      if (src.fullName.type === "library") {
        compiler.addLib(src)
      }
    }

    // group output by type:
    //  - all libs
    //  - all templates
    //  - all tests

    for (const lib of compiler.allLibs()) {
        stdout.write(JSON.stringify(lib)+"\n")
    }
    
    for (const src of sources) {
      if (src.fullName.type === 'template') {
        stdout.write(JSON.stringify(src)+"\n")
      }
    }
    
    for (const src of sources) {
      if (src.fullName.type === 'test') {
        stdout.write(JSON.stringify(src)+"\n")
      }
    }
  }
}
