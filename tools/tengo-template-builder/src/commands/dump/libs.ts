import { Command } from '@oclif/core'
import { createLogger, getPackageInfo, newCompiler, parseSources } from '../../compiler/main'
import { stdout } from 'process'

export default class DumpLibs extends Command {
  static override description = 'parse all sources and installed dependencies and provide dump of all libraries found to stdout'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  public async run(): Promise<void> {
    const logger = createLogger()
    const packageInfo = getPackageInfo()
    
    const compiler = newCompiler(logger, packageInfo)
    const sources = parseSources(logger, packageInfo, 'src')
    
    for (const src of sources) {
      if (src.fullName.type === "library") {
        compiler.addLib(src)
      }
    }

    for (const lib of compiler.allLibs()) {
      stdout.write(JSON.stringify(lib)+"\n")
    }
  }
}

