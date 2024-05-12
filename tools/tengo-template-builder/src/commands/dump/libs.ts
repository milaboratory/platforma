import { Command, Flags } from '@oclif/core'
import { createLogger, getPackageInfo, newCompiler, parseSources } from '../../compiler/main'
import { stdout } from 'process'

export default class DumpLibs extends Command {
  static override description = 'parse sources in current package and dump all found templates to stdout'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  static override flags = {
    deps: Flags.boolean({name: 'deps', description: 'add also all libraries found in node_modules'}),
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(DumpLibs)

    const logger = createLogger()
    const packageInfo = getPackageInfo()

    const sources = parseSources(logger, packageInfo, 'src', '')
    
    if (!flags.deps) {
      for (const src of sources) {
        if (src.fullName.type === "library") {
          stdout.write(JSON.stringify(src)+"\n")
        }
      }

      return
    }

    const compiler = newCompiler(logger, packageInfo)
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

